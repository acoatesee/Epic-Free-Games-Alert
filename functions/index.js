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

  subscriptions.doc(url.split('/').pop()).set({ // 🚧 change to use automatic ID on delete lookup by url field
    url: url,
    lastMessageDate: null 
  })

  res.json(url)
})


const sendOffers = (offers, targetUrl) => {
  console.log({offers})
  if(offers.length < 1) {
    console.log("no offers saved")
    return
  }
  const now = new Date()
  
  let  [preMsg, offerColor] = ["uknown Offer", "111"]
  const embeds = offers.map(offer => {
    effectiveDate = offer.effectiveDate.toDate();
    console.log(now, effectiveDate);
    if (effectiveDate <= now) { // green if offer is active
      [preMsg, offerColor] = ["Current Offer", 4582551] 
    } else if (effectiveDate >= now) { // pink if planned 
      [preMsg, offerColor] = ["Future Offer", 13447839]
    } 
    return {
      "title" : `${preMsg}: ${offer.title}`,
      "description" : "",
      "url" : `https://www.epicgames.com/store/en-US/p/${offer.productSlug}`,
      "color" : offerColor,
      "thumbnail": {
        "url": offer.thumbnail
      }       
    }
  }) 

  const message = {
      "username" : "Free Game bot",
      "avatar_url" : "https://image.flaticon.com/icons/png/512/1120/1120676.png",
      "content" : "New free games!",
      "embeds" : embeds
  }

  console.log(message);
  // try {
    return axios.post(targetUrl, message)
  // } catch (error) {
  //   console.log("failure no such url?", error)
  // }
}

/**
 * 
 * @returns array of game objects [{title: "Fun Game", productSlug: "Fun-Game", img: "cdn.epicgames.com/FunGame-Poster",...},...]
 */
const getGames = () => {
  return (
    db.collection("freeGames")
    .get()     
    .then((querySnapshot) => {
        return querySnapshot.docs.map((doc) => { // 
          return doc.data()
        });
    })
    .catch((error) => {
        console.log("Error getting documents: ", error);
    })
  )
}

/**
 * when a new subscriber is added send a welcome msg and the current deals
 */
const onCreateSubscriber = functions.firestore.document('/subscriptions/{subId}')
  .onCreate(async (snap, context) => { 
    // console.log({snap}) 
    let subId = context.params.subId
    let snapData = snap.data()
    console.log(`Subscriber: ${subId} at url: ${snapData.url}`);
    let games = await getGames()
    sendOffers(games,snapData.url)
      .catch((error) =>console.log(error))
});

/**
 * when games are added to the promotions collection send a message to all subscribers
 */
const onUpdateFreeGames = functions.firestore.document('/freeGames/{gameName}')
  .onUpdate( async(change, context) =>{
    console.log('***free game Change!')
    const before = change.before.data()
    const after = change.after.data()
    console.log(after.effectiveDate.toDate())
    console.log(`before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)}`)
    // let games = snap.data()
    // console.log(`current free games : ${games}`);
    return
  })

  
const onCreateFreeGames = functions.firestore.document('/freeGames/{gameName}')
  .onCreate(async( snap, context) => {
    console.log('new game added')

  });



module.exports ={
  updateGames, 
  subscribe,
  onCreateSubscriber,
  onUpdateFreeGames,
  onCreateFreeGames,
  sendOffers
}