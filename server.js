const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const influencerRoutes = require("./src/router/influencer")

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON requests

// Routes
app.use('/api/influencers', influencerRoutes);

app.get('/', (req, res) => {
    res.send('API is running');
  });
  

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});