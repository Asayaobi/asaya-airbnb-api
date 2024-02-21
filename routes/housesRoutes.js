import { Router } from 'express'
const router = Router()
import db from '../db.js' // import the database connection

// Define a GET route for fetching a single house
router.get('/houses/:houseId', async (req, res) => {
  try {
    let houseId = Number(req.params.houseId)
    if (!houseId) {
      throw new Error('Please insert a number')
    }
    const { rows } = await db.query(
      `SELECT * FROM houses WHERE house_id = ${req.params.houseId}`
    )
    if (rows.length === 0) {
      throw new Error(`No house found with id ${req.params.houseId}`)
    }
    res.json(rows)
  } catch (err) {
    console.error(err.message)
    res.json(err.message)
  }
})

// Update the /houses route with query using queryString
router.get('/houses', async (req, res) => {
  try {
    //query for houses with 1 = 1 to start with true condition
    let queryString = 'SELECT * FROM houses WHERE 1 = 1'
    //query for location
    if (req.query.location) {
      queryString += ` AND location = '${req.query.location}'`
    }
    //query for max price
    if (req.query.max_price) {
      queryString += ` AND price_per_night <= '${req.query.max_price}'`
    }
    //query for min rooms
    if (req.query.min_rooms) {
      queryString += ` AND bedrooms >= '${req.query.min_rooms}'`
    }
    //query for search
    if (req.query.search) {
      queryString += ` AND description LIKE '%${req.query.search}%'`
    }
    // query for sort and order
    if (req.query.sort && req.query.order) {
      queryString += ` ORDER BY ${req.query.sort} ${req.query.order}`
    } else if (req.query.sort) {
      // query for sort and make it ASC by default
      queryString += ` ORDER BY ${req.query.sort} ASC`
    }
    const { rows } = await db.query(queryString)
    res.json(rows)
  } catch (err) {
    console.error(err.message)
    res.json(err)
  }
})

// Update the /houses route with queries with Array
// router.get('/houses', async (req, res) => {
//   try {
//     let queryArray = []
//     //query for location
//     if (req.query.location) {
//       queryArray.push(`location = '${req.query.location}'`)
//     }
//     //query for max price
//     if (req.query.max_price) {
//       queryArray.push(`price_per_night <= '${req.query.max_price}'`)
//     }
//     // query for min rooms
//     if (req.query.min_rooms) {
//       queryArray.push(`bedrooms >= '${req.query.min_rooms}'`)
//     }
//     // query for search
//     if (req.query.search) {
//       queryArray.push(`description LIKE '%${req.query.search}%'`)
//     }
//     //apply the array with join
//     let result =
//       queryArray.length > 0
//         ? `SELECT * FROM houses WHERE ${queryArray.join(' AND ')}`
//         : `SELECT * FROM houses`
//     console.log(result)
//     //query for sort and order
//     if (req.query.sort && req.query.order) {
//       result += ` ORDER BY ${req.query.sort} ${req.query.order}`
//     } else if (req.query.order) {
//       result += ` ORDER BY ${req.query.sort}`
//     }

//     console.log(result)
//     const { rows } = await db.query(result)
//     res.json(rows)
//   } catch (err) {
//     console.error(err.message)
//     res.json(err)
//   }
// })

export default router
