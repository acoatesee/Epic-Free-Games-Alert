const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const express = require('express');
const App = express();

admin.initializeApp()
const db = admin.firestore()




App.post('/update-games', async (req, res) =>{
  console.log('runnin')
  // console.log(db.collection('freeGames').listDocuments)
  const freeGamesUrl = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=CA&allowCountries=CA,US';
  const gamesList = await axios.get(freeGamesUrl)
    .then(res => res.data.data.Catalog.searchStore.elements)
    .catch(err =>{
      console.log(err)
      return false
  });  
  if(!gamesList) return res.status(500).json({error: 'The url address used by epic games has changed'})

  const isFree = (game) => game.price.totalPrice.discountPrice === 0 && game.price.totalPrice.originalPrice !== 0
  const batch = db.batch()

  gamesList
    .filter(game => isFree(game))
    .forEach(({title,effectiveDate,productSlug}) => {
      // games are added with the url "productSlug" as an ID to prevent duplicate documents
      // note old games are not removed this will need to be handled by querying promo expiry date or wiping and rebuilding collection
      batch.set(
        db.collection('freeGames').doc(productSlug),
        {title, effectiveDate, productSlug}
  )})
  batch
    .commit()
    .then(res => console.log(res))
    .catch(err => console.log(err))
  

  return res.status(200).json({})
});


const epic = functions.https.onRequest(App)

module.exports ={
  epic 
}

