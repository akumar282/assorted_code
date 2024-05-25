import recipeUrls from './cookeryUrls.json' assert { type: 'json' };
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';

async function extractRecipeData(url) {
    const response = await axios.get(url);
  
    // Use cheerio to parse the HTML 
    const $ = cheerio.load(response.data);
    
    // Extract the JSON of recipe data embedded in the HTML
    const jsonInHtml = $('script[type="application/ld+json"]').html();
    const jsonData = JSON.parse(jsonInHtml)[0];
  
    // Extract user photos embedded in the HTML
    const userPhotos = extractUserPhotos($);
  
    return { jsonData, userPhotos };
  }
  
function extractUserPhotos($) {
    const urls = []; // Array to store the extracted URLs
  
    // Assuming the relevant image URLs are in <img> tags
    const imgElements = $('img');

    for (let i = 0; i < imgElements.length; i++) {
        const imgSrc = $(imgElements[i]).attr('data-src');
  
        // Check if the URL contains the sequence "imagesvc"
        if (imgSrc?.includes('imagesvc')) {
            // Remove anything following ".jpg" or ".png" in the URL
            let imageUrl = imgSrc.match(/.*\.(jpg|png|jpeg)/gi)?.[0];
                if (imageUrl) {
                    urls.push(imageUrl); // Add the modified URL to the 'urls' array
                } else {
                    console.error('No user images found.');
                }
        }
    }
    
    return urls; // Return the array of photo URLs
}

async function add_to_db(data, userPhotos) {

    // Checking for null categories that require accessing array
    const cat = data.recipeCategory?.[0];
    const cui = data.recipeCuisine?.[0];
    const yie = data.recipeYield?.[0];

    const json = {
      name: data.name,
      category: cat,
      cuisine: cui,
      datePublished: data.datePublished,
      dateModified: data.dateModified,
      description: data.description,
      image: data.image.url,
      video: data.video,
      nutrition: data.nutrition,
      ingredientList: data.recipeIngredient,
      cookTime: data.cookTime,
      prepTime: data.prepTime,
      totalTime: data.totalTime,
      servings: yie,
      instructions: data.recipeInstructions,
      reviews: data.review,
      userPhotos: userPhotos
    };

    // Clean up fields in JSON
    delete json.image['@type'];
    delete json.video['@type'];
    delete json.ingredientList['@type'];
    delete json.nutrition['@type'];

    for (let step of json.instructions) {
        delete step['@type'];
    }

    if (json.reviews) {
        for (let review of json.reviews) {
            review.reviewRating = review.reviewRating.ratingValue;
            review.author = review.author.name;
            delete review['@type'];
        }
    }

    /**
     * Expected format of JSON for database
     * 
     * name: recipe name
     * category: if included, the category of the recipe (i.e. 'Lunch')
     * cuisine: if included, the type of cuisine of the recipe (i.e. 'Japanese')
     * datePublished: date the recipe was published
     * dateModified: date the recipe was updated (if no updates, the same as datePublished)
     * description: recipe description
     * image: recipe image (usually the thumbnail for the recipe)
     * video: the featured video of the recipe
     * nutrition: the nutritional data of the recipe (i.e. calories, total fats, etc.)
     * ingredientList: list of ingredients needed for the recipe
     * cookTime: time to cook recipe
     * prepTime: time to prep recipe
     * totalTime: cookTime + prepTime
     * servings: # of servings the recipe makes
     * instructions: list of recipe instructions
     * reviews: list of all reviews for the recipe, if any
     * userPhotos: first few (max of 5) photos uploaded by users of the recipe
     */
    return json;
}

// Function to get the first character of the URL path
function getInitialChar(url) {
    const path = new URL(url).pathname;
    const stripped = path.split('/').pop(); // Remove the common prefix
    return stripped.charAt(0).toLowerCase();
}

// Group URLs by their initial character
const groupedUrls = recipeUrls.reduce((groups, url) => {
    const char = getInitialChar(url);
    if (!groups[char]) {
        groups[char] = [];
    }
    groups[char].push(url);
    return groups;
}, {});

// Process each group of URLs separately
for (let char in groupedUrls) {
    const arr = [];
    const promises = [];

    for (let url of groupedUrls[char]) {
        promises.push(
            extractRecipeData(url).then(({jsonData, userPhotos}) => {
                return add_to_db(jsonData, userPhotos);
            })
        );
    }

    Promise.all(promises)
        .then((results) => {
            arr.push(...results);
            fs.writeFileSync(`cookeryData-${char}.json`, JSON.stringify(arr, null, 2));
        })
        .catch((error) => {
            console.error('Error:', error);
        });
}
