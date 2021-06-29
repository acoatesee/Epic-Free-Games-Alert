const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
// const express = require('express');
// const App = express();

admin.initializeApp()
const db = admin.firestore()

/**
 * requirements:
 * db  - pending
 *   active promotions  
 *   subscriptions 
 * 
 * functions - pending
 *   updateGames
 *     trigger: weekly scheduled function
 *     action: get free games and parse for promotions 

 *   subscribe
 *     trigger: UI || manual 
 *     action: add subscription url to db 
 *     then: new subscription gets sent active promos
 * 
 *   unsubscribe
 *     trigger: UI || multiple fails [what happens when a discord webhook is destroyed?] 
 *     action: remove subscription from db
 * 
 *   sendOffers
 *     trigger: successful updateGames || new subscription
 *     action: post request to subscriber containing free game promo summary and link
 *  
 * nice to have
 *    send thumbnail
 *    format discord msg
 *    color code by content type ie base:blue , dlc: green
 */

const updateGames = functions.https.onRequest(async (req, res) => {
  /**
   *  🚧 needs to handle removing old data this can happen while waiting for response from axios if promotional date range can be determined.
   *      - prevents serving outdated promotions if the 'freeGamesUrl' becomes depreciated      
   * */

  const freeGamesUrl = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=CA&allowCountries=CA,US';

  // retrieve and unpack the games served to the free games promotional page 
  const gamesList = await axios.get(freeGamesUrl)
    .then(res => res.data.data.Catalog.searchStore.elements)
    .catch(err =>{
      console.log(err)
      return false
  });  
  if(!gamesList) return res.status(500).json({error: 'The url address used by epic games has changed'})


  /**
   * filter for promotion and add promotional games to the freeGames collection
   * games are added with the url "productSlug" as the document ID to prevent duplicate documents
   */
  // note old games are not removed this will need to be handled by querying promo expiry date or wiping and rebuilding collection
  // is currently free but normally costs money 
  const isFree = (game) => game.price.totalPrice.discountPrice === 0 && game.price.totalPrice.originalPrice !== 0
  const batch = db.batch()

  gamesList
    .filter(game => isFree(game))
    .forEach(game => {
      const {title,effectiveDate,productSlug, offerType} = game
      const thumbnail = game.keyImages.find(img => img.type === "Thumbnail").url
      batch.set(
        db.collection('freeGames').doc(productSlug),
        {title, effectiveDate, productSlug, offerType, thumbnail}
  )})
  batch
    .commit()
    .then(res => console.log(res))
    .catch(err => console.log(err))


  return res.status(200).json({})
});

const subscribe = functions.https.onRequest(async (req, res) => {
  const subscriptions = db.collection('subscriptions')

  const {url} = req.body
  if (!url){
    res.status(400).json({
      error: 'This method expects a url field eg.`url: "https://discord.com/api/webhooks/[some webhook]"`'})
  } 

  subscriptions.doc(url.split('/').pop()).set({
    url: url,
    lastMessageDate: null 
  })

  res.json(url)
})


// const sendOffers = functions.firestore
//   .document('subscriptions/{docId}')
//   .onCreate((change, context) => { 
//     console.log({change}) 
//     console.log({context}) 
//   });


module.exports ={
  updateGames, 
  subscribe,
  sendOffers
}