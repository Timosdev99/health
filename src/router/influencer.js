const express = require('express');
const router = express.Router();

const { searchPubMed } = require('../api/pubmed');
const { aiPrompts } = require("../utils/ai_prompt")


router.post('/analyze', async (req, res) => {
    try {
       
        const { influencerName, followerCount, textInput } = req.body;

        const claims = [
            {
                text: 'Example claim 1',
                category: 'Nutrition'
            },
            {
               text: 'Example claim 2',
               category: 'Medicine'
            }
        ];

       
        const uniqueClaims = claims; 

       
        const verifiedClaims = await Promise.all(uniqueClaims.map(async (claim) => {
            const pubmedResults = await searchPubMed(claim.text);
           
             let verificationStatus = "Questionable";
             let confidenceScore = 0.5;
             if(pubmedResults && pubmedResults.length > 0){
               verificationStatus = "Verified";
               confidenceScore = 0.9;
             } else {
                
             }


             return {
                  ...claim,
                   verificationStatus,
                   confidenceScore,
                  journal_citations: pubmedResults ? pubmedResults.map(result => result.id) : [],
              };

        }));



        
          const trustScore = 0.6 
       const influencerData = {
            name: influencerName,
            follower_count: followerCount,
            claims: verifiedClaims,
           trustScore,
       }

       
        res.json(influencerData);

    } catch (error) {
        console.error("Error during analysis:", error);
        res.status(500).json({ error: "An error occurred during analysis" });
    }
});

module.exports = router;