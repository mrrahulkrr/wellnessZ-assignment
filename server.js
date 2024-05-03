// index.js

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const AWS = require('aws-sdk');

const {
  S3
} = require('@aws-sdk/client-s3');

const multerS3 = require('multer-s3');
const dotenv = require('dotenv');
const { Sequelize, DataTypes, Op } = require('sequelize');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Configure AWS SDK
// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

// Create S3 instance
const s3 = new S3({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },

  region: process.env.AWS_REGION
});

// Configure Multer to use S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    acl: 'public-read',
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      cb(null, Date.now().toString())
    }
  })
});

// Connecting to PostgreSQL database using Sequelize
const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'postgres'
});

// Define Post model
const Post = sequelize.define('Post', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  desc: {
    type: DataTypes.STRING,
    allowNull: false
  },
  tag: {
    type: DataTypes.STRING,
    allowNull: false
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

// Sync model with database
sequelize.sync()
  .then(() => console.log('Database & tables created!'))
  .catch(err => console.error('Error creating database tables: ', err));

// REST API Endpoints

// Get all posts with pagination, sorting, keyword and tag filters
app.get('/posts', async (req, res) => {
  try {
    const { page = 1, limit = 10, sort, keyword, tag } = req.query;
    let condition = {};
    if (keyword) {
      condition = {
        ...condition,
        [Op.or]: [
          { title: { [Op.iLike]: `%${keyword}%` } },
          { desc: { [Op.iLike]: `%${keyword}%` } }
        ]
      };
    }
    if (tag) {
      condition = {
        ...condition,
        tag: tag
      };
    }
    const posts = await Post.findAndCountAll({
      where: condition,
      limit: limit,
      offset: (page - 1) * limit,
      order: sort ? [sort.split(',')] : [['createdAt', 'DESC']]
    });
    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts: ', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new post
app.post('/posts', upload.single('image'), async (req, res) => {
  try {
    const { title, desc, tag } = req.body;
    const imageUrl = req.file.location;
    const post = await Post.create({ title, desc, tag, imageUrl });
    res.json(post);
  } catch (error) {
    console.error('Error creating post: ', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
