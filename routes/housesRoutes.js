import { Router } from 'express'
import db from '../db.js' // import the database connection
import jwt from 'jsonwebtoken'
const jwtSecret = process.env.JWT_SECRET
const router = Router()

router.post('/houses', async (req, res) => {
  try {
    // Validate Token
    const decodedToken = jwt.verify(req.cookies.jwt, jwtSecret)
    if (!decodedToken || !decodedToken.user_id || !decodedToken.email) {
      throw new Error('Invalid authentication token')
    }
    // Validate fields
    let {
      location,
      bedrooms,
      bathrooms,
      price_per_night,
      description,
      photos
    } = req.body
    if (
      !location ||
      !bedrooms ||
      !bathrooms ||
      !price_per_night ||
      !description ||
      !photos
    ) {
      throw new Error(
        'location, bedrooms, bathrooms, price, descriptions, and photos are required'
      )
    }
    // Validate photos
    if (!Array.isArray(photos)) {
      throw new Error('photos must be an array')
    }
    if (!photos.length) {
      throw new Error('photos array cannot be empty')
    }
    if (!photos.every((p) => typeof p === 'string' && p.length)) {
      throw new Error('all photos must be strings and must not be empty')
    }
    // Create house
    let houseCreated = await db.query(`
      INSERT INTO houses (location, bedrooms, bathrooms, price_per_night, description, host_id)
      VALUES ('${location}', '${bedrooms}', '${bathrooms}', '${price_per_night}', '${description}', '${decodedToken.user_id}') 
      RETURNING *
    `)
    let house = houseCreated.rows[0]
    // Create photos
    let photosQuery = 'INSERT INTO pictures (pic_url, house_id) VALUES '
    photos.forEach((p, i) => {
      if (i === photos.length - 1) {
        photosQuery += `('${p}', ${house.house_id}) `
      } else {
        photosQuery += `('${p}', ${house.house_id}), `
      }
    })
    photosQuery += 'RETURNING *'
    let photosCreated = await db.query(photosQuery)
    // Compose response
    house.photo = photosCreated.rows[0].photo
    house.reviews = 0
    house.rating = 0
    // Respond
    // Retrieve the house data along with distinct pic_urls
    let result = await db.query(`
  SELECT DISTINCT h.*, p.pic_url
  FROM houses h
  LEFT JOIN pictures p ON h.house_id = p.house_id
  WHERE h.house_id = ${house.house_id}
`)

    let houseWithPhotos = result.rows[0]
    res.json(houseWithPhotos)
  } catch (err) {
    res.json({ error: err.message })
  }
})

router.get('/houses', async (req, res) => {
  try {
    // build query base
    let sqlquery =
      'SELECT * FROM (SELECT DISTINCT ON (houses.house_id) houses.*, pictures.pic_url FROM houses'
    let filters = []
    // add photos
    sqlquery += ` LEFT JOIN pictures ON houses.house_id = pictures.house_id `
    // add WHERE
    if (
      req.query.location ||
      req.query.max_price ||
      req.query.min_rooms ||
      req.query.search
    ) {
      sqlquery += ' WHERE '
    }
    // add filters
    if (req.query.location) {
      filters.push(`location = '${req.query.location}'`)
    }
    if (req.query.max_price) {
      filters.push(`price_per_night <= '${req.query.max_price}'`)
    }
    if (req.query.min_rooms) {
      filters.push(`bedrooms >= '${req.query.min_rooms}'`)
    }
    if (req.query.search) {
      filters.push(`description LIKE '%${req.query.search}%'`)
    }
    // array to string divided by AND
    sqlquery += filters.join(' AND ')
    sqlquery += ') AS distinct_houses'
    // add ORDER BY
    if (req.query.sort === 'rooms') {
      sqlquery += ` ORDER BY bedrooms DESC`
    } else {
      sqlquery += ` ORDER BY price_per_night ASC`
    }
    // Run query
    let { rows } = await db.query(sqlquery)
    // Respond
    res.json(rows)
  } catch (err) {
    res.json({ error: err.message })
  }
})

router.get('/houses/:house_id', async (req, res) => {
  try {
    let { rows } = await db.query(
      `SELECT * FROM houses WHERE house_id = ${req.params.house_id}`
    )
    if (!rows.length) {
      throw new Error(`No house found with id ${req.params.user_id}`)
    }
    let house = rows[0]
    // join user
    let { rows: hostRows } = await db.query(
      `SELECT user_id, profile_pic_url, first_name, last_name FROM users WHERE user_id = ${house.host_id}`
    )
    house.host = {
      user_id: hostRows[0].user_id,
      profile_pic_url: hostRows[0].profile_pic_url,
      firstName: hostRows[0].first_name,
      lastName: hostRows[0].last_name
    }
    // join photos
    let { rows: photosRows } = await db.query(
      `SELECT * FROM pictures WHERE house_id = ${house.house_id}`
    )
    house.images = photosRows.map((p) => p.pic_url)
    delete house.user_id
    res.json(house)
  } catch (err) {
    res.json({ error: err.message })
  }
})

router.patch('/houses/:house_id', async (req, res) => {
  try {
    // Validate Token
    const decodedToken = jwt.verify(req.cookies.jwt, jwtSecret)
    if (!decodedToken || !decodedToken.user_id || !decodedToken.email) {
      throw new Error('Invalid authentication token')
    }
    const { location, bedrooms, bathrooms, description, price_per_night } =
      req.body

    //update houses table
    let house
    // Validate fields
    if (location || bedrooms || bathrooms || description || price_per_night) {
      let queryArray = []
      if (location) {
        queryArray.push(`location = '${location}'`)
      }
      if (bedrooms) {
        queryArray.push(`bedrooms = ${bedrooms}`)
      }
      if (bathrooms) {
        queryArray.push(`bathrooms = ${bathrooms}`)
      }
      if (description) {
        queryArray.push(`description = '${description}'`)
      }
      if (price_per_night) {
        queryArray.push(`price_per_night = ${price_per_night}`)
      }
      let query = `UPDATE houses SET ${queryArray.join()} WHERE house_id = ${req.params.house_id} AND host_id = ${decodedToken.user_id} RETURNING *`
      const updateHouse = await db.query(query)
      house = updateHouse.rows[0]
    }
    //update pictures table
    let pictures = req.body.images
    if (pictures && pictures.length) {
      // Fetch existing pictures for the house
      let getExistingPictures = await db.query(
        `SELECT * FROM pictures WHERE house_id = ${req.params.house_id}`
      )
      //if there's no existing picture
      if (getExistingPictures.rowCount === 0) {
        const insertPictures = (pictures) => {
          // Transform each picture URL into the sql query format
          const formattedPictures = pictures.map(
            (picture) => `('${picture}', ${req.params.house_id})`
          )
          // Join the formatted picture strings with a comma
          return formattedPictures.join(', ')
        }

        // Call insertPictures to get the formatted picture strings
        const updatePictures = insertPictures(pictures)

        // Formulate the insert query
        const insertImagesQuery = `INSERT INTO pictures (pic_url, house_id) VALUES ${updatePictures}`

        // Execute the insert query
        await db.query(insertImagesQuery)
      }

      let oldPictures = getExistingPictures.rows
      //if there're existed images
      const replaceUrl = (oldPictures, newPictures) => {
        return oldPictures.map((oldPicture, index) => {
          if (index < newPictures.length) {
            oldPicture.pic_url = newPictures[index]
          }
          return oldPicture
        })
      }

      let updatedPictures = replaceUrl(oldPictures, pictures)

      for (const picture of updatedPictures) {
        await db.query(
          `UPDATE pictures SET pic_url = $1 WHERE picture_id = $2`,
          [picture.pic_url, picture.picture_id]
        )
      }
    }
    // Send the response
    res.json(house)
  } catch (err) {
    console.error(err.message)
    res.json({ error: 'Please insert valid data' })
  }
})

router.get('/locations', async (req, res) => {
  try {
    let query = `SELECT DISTINCT(location) FROM houses`
    let { rows } = await db.query(query)
    rows = rows.map((r) => r.location)
    res.json(rows)
  } catch (err) {
    res.json({ error: err.message })
  }
})

router.get('/listings', async (req, res) => {
  try {
    // Validate Token
    const decodedToken = jwt.verify(req.cookies.jwt, jwtSecret)
    if (!decodedToken || !decodedToken.user_id || !decodedToken.email) {
      throw new Error('Invalid authentication token')
    }
    // Get houses
    let query = `
      SELECT
        houses.house_id,
        houses.location,
        houses.bedrooms,
        houses.bathrooms,
        houses.reviews_count,
        houses.rating,
        houses.price_per_night,
        pictures.pic_url
      FROM houses
      LEFT JOIN (
          SELECT DISTINCT ON (house_id) house_id, pic_url
          FROM pictures
      ) AS pictures ON pictures.house_id = houses.house_id
      WHERE houses.host_id = ${decodedToken.user_id}
    `

    let { rows } = await db.query(query)
    // Respond
    res.json(rows)
  } catch (err) {
    res.json({ error: err.message })
  }
})

router.delete('/houses/:houseId', async (req, res) => {
  try {
    // Validate Token
    const decodedToken = jwt.verify(req.cookies.jwt, jwtSecret)
    if (!decodedToken || !decodedToken.user_id || !decodedToken.email) {
      throw new Error('Invalid authentication token')
    }
    // check if the user user_id (decodedToken.user_id) is the host of the house specified by house_id.
    const queryString = `
      SELECT * FROM houses WHERE host_id = ${decodedToken.user_id} AND house_id = ${req.params.houseId}
    `

    const result = await db.query(queryString)
    if (result.rowCount === 0) {
      throw new Error('not authorized')
    }

    const { rowCount } = await db.query(`
    DELETE FROM houses WHERE house_id = ${req.params.houseId}
    `)
    if (!rowCount) {
      throw new Error('Delete Failed')
    }
    //response message
    res.json({ message: `House ${req.params.houseId} is deleted` })
  } catch (err) {
    console.error(err)
    res.json({ error: 'Please insert a valid data' })
  }
})

export default router
