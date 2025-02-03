const axios = require('axios');

const PUBMED_API_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const searchPubMed = async (claim) => {
    try {
        const query = encodeURIComponent(claim);
        const url = `${PUBMED_API_BASE_URL}/esearch.fcgi?db=pubmed&term=${query}&retmax=5`; // Limit to 5 results
        const response = await axios.get(url);
        const xmlData = response.data;
        const idListRegex = /<Id>(\d+)<\/Id>/g;
        const idList = [];
        let match;
        while ((match = idListRegex.exec(xmlData)) !== null) {
            idList.push({id: match[1]});
        }

         if(idList.length === 0){
             return [];
         }

        const idString = idList.map(id => id.id).join(',');
        const summaryURL = `${PUBMED_API_BASE_URL}/esummary.fcgi?db=pubmed&id=${idString}`

         const summaryResponse = await axios.get(summaryURL)
         const summaryXMLData = summaryResponse.data;
         const pubmedTitleRegex = /<Title>(.*?)<\/Title>/g;
         const pubmedAuthorsRegex = /<AuthorList>(.*?)<\/AuthorList>/g;
         const pubmedAuthorsNameRegex = /<Name>(.*?)<\/Name>/g;
         const pubmedAuthorNameValueRegex = /<LastName>(.*?)<\/LastName>/g;


         const updatedIdList = [];

         let summaryMatch;
        while ((summaryMatch = pubmedTitleRegex.exec(summaryXMLData)) !== null) {
            const title = summaryMatch[1];
            let authMatch;
            const authors = [];
            pubmedAuthorsRegex.lastIndex = 0;
            while ((authMatch = pubmedAuthorsRegex.exec(summaryXMLData)) !== null) {
                let nameMatch;
                 const authorNames = [];
                pubmedAuthorsNameRegex.lastIndex = 0;
                while((nameMatch = pubmedAuthorNameValueRegex.exec(authMatch[1])) !== null){
                      authorNames.push(nameMatch[1]);
                 }
                authors.push(authorNames.join(", "));
            }
           updatedIdList.push({
            id:idList[updatedIdList.length].id,
            title,
            authors: authors.join(", "),
           })


        }


        return updatedIdList;

    } catch (error) {
        console.error("Error fetching data from PubMed:", error);
        return [];
    }
};

module.exports = {
    searchPubMed
};