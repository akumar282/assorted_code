import axios from 'axios';
import fs from 'fs';
import keywords from "./keywords.json" assert {type: 'json'};
import cheerio from 'cheerio';

const CONCURRENCY = 50;

async function findAllRecipes(keywords) {
    const queue = new Set();
    const visited = new Set();

    // If there are any results on the search page, format a link that can be revisited to grab the relevant recipe urls
    // After, add the link to a queue for later processing

    // Try every keyword as a search term
    for (let word of keywords) {
        // 60,000 is approximation for max number of urls for one search term
        // Max of 24 urls per page, so increment by 24
        let shouldBreak = false;
        for (let i = 0; i < 60000; i+=24) {
            const potentialUrl = `https://www.allrecipes.com/search?${word}=${word}&offset=${i}&q=${word}`
            // Check every 26 pages (624 / 24 = 26) to make sure the page still has results 
            if (i % 624 === 0 && i != 0) {
                await axios.get(potentialUrl)
                .then(response => {
                    const check = response.data;
                    const $ = cheerio.load(check);
                    
                    // If no results are found, stop formatting links for this search term and move on to the next one
                    if ($('#search-results__no-results-reader_1-0')) {
                        shouldBreak = true;
                    }
                })
                .catch(error => {
                    console.log('Error occurred:', error);
                });
            }
            if (shouldBreak) {
                break;
            }
            queue.add(potentialUrl);
        }
        console.log(`Added: ${word}`);
    }

    let urlCounter = 0;

    const stream = fs.createWriteStream('recipeUrls.csv');

    while (queue.size > 0) {
        let promises = [];
        let iterator = queue.values();

        // Process number of links equal to CONCURRENCY at a time from the queue to speed up emptying the queue
        for(let i=0; i<CONCURRENCY; i++) {
            let url = iterator.next().value;
            queue.delete(url);
            promises.push(fetchUrl(url, visited));
        }

        // Get URLs from the processed links. Write each url to the file and mark them as visited so they won't be readded
        const newUrls = await Promise.all(promises);
        if (newUrls) {
            newUrls.forEach((recipeUrls) => {
                if (recipeUrls) {
                    recipeUrls.forEach((url) => {
                        stream.write(`"${url}"\n`);
                        urlCounter++;
                        visited.add(url);
                    });
                }
            });
        }

        // Console feedback to keep track of stats
        console.log(`Recipes found: ${urlCounter}`);
        console.log(`Queue: ${queue.size}`);
    }

    stream.end();

    console.log('File written successfully.');
}

// Gets axios response for URLs passed. Kept separate for concurrency.
async function fetchUrl(url) {
    let res;
    try {
        res = await axios.get(url);
    } catch (err) {
        console.error(`Failed to fetch ${url}`);
        return {recipeUrls: []};
    }

    return findUrls(res.data, visited);
}

// Grabs all recipe urls off the page it is passed. Removes recipe urls that have already been visited.
const findUrls = (data, visited) => {
    const $ = cheerio.load(data);

    const recipeUrls = $("a[href^='https://www.allrecipes.com/recipe/']")
        .map((i, a) => $(a).attr('href'))
        .get()
        .filter(url => !visited.has(url));

    return recipeUrls;
}

findAllRecipes(keywords)
    .then(() => console.log("Web service complete."))
    .catch(err => console.error(err));
