import recipeUrls from './carneadesUrls.json';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import fs from 'fs';

const CONCURRENCY = 3;

interface RecipeData {
    name: string;
    headline: string;
    datePublished: string;
    dateModified: string;
    aggregateRating: object | undefined;
    articleBody: string;
    description: string;
    image: string | undefined;
    recipeIngredient: string[] | undefined;
    cookTime: string | undefined;
    prepTime: string | undefined;
    totalTime: string | undefined;
    recipeYield: string | undefined;
    recipeInstructions: Array<{ "@type"?: string; text: string; }>;
    keywords: string[] | undefined;
    reviews?: Array<{
        review: string;
        username: string;
        location: string;
        date: string;
    }>;
}

async function extractRecipeData(url: string, retryCount = 0): Promise<{ recipeData: RecipeData }> {
    
    // Reviews are rendered with JS, hence why puppeteer is needed
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
    } catch (error) {

        // If a timeout error occurs, retry the url 3 times before moving on to the next one
        // Prevents skipping due to network fluctuations, especially when running concurrency
        await browser.close();
        const isTimeout = (error as { name?: string }).name === 'TimeoutError';

        console.log(isTimeout
            ? `Timeout on ${url}, retrying (${retryCount + 1}/3)...`
            : `Failed to load ${url} due to error: ${error}`);

        return retryCount < 3 && isTimeout
            ? extractRecipeData(url, retryCount + 1)
            : { recipeData: {} as RecipeData };
    }

    // Wait for the review-specific class selector and extract review text
    const reviews = await page.evaluate(() => {
        const reviewItems = Array.from(document.querySelectorAll('.ReviewListItem-bIjxOo.lhVDms'));
        return reviewItems.map(item => {
            const review = item.querySelector('.ReviewListReview-hWGVwP')?.textContent ?? '';
            const username = item.querySelector('.ReviewListUsername-jgRcVX')?.textContent ?? '';
            const location = item.querySelector('.ReviewListLocation-caEblk')?.textContent ?? '';
            const date = item.querySelector('.ReviewListDate-gJCpxJ')?.textContent ?? '';
    
            return { review, username, location, date };
        });
    });

    // Get the rest of the recipeData out of the embedded JSON
    const bodyHTML = await page.evaluate(() => document.documentElement.innerHTML);
    const $ = cheerio.load(bodyHTML);
    const jsonInHtml = $('script[type="application/ld+json"]').html();
    let recipeData: RecipeData = JSON.parse(jsonInHtml ?? '[]');

    await browser.close();
    
    // Check if recipeData is undefined, if so initialize it with an empty object
    if (!recipeData) {
        recipeData = {} as RecipeData;
        console.error(`No JSON data found on page: ${url}`);
    }

    // Add the reviews to the data object
    recipeData.reviews = reviews;

    return { recipeData };
}

async function shape_data(data: RecipeData): Promise<RecipeData> {

    // Remove the image dimension limiters from its url
    let imageUrl: string | undefined;
    if (data.image && data.image[0]) {
        imageUrl = data.image[0].replace(/\/\d+:\d+\/w_\d+,h_\d+,c_limit/, '');
    }

    // Take the important information we need to store in the DB
    const json: RecipeData = {
        name: data.name,
        headline: data.headline,
        datePublished: data.datePublished,
        dateModified: data.dateModified,
        aggregateRating: data.aggregateRating,
        description: data.description,
        articleBody: data.articleBody,
        image: imageUrl,
        recipeIngredient: data.recipeIngredient,
        cookTime: data.cookTime,
        prepTime: data.prepTime,
        totalTime: data.totalTime,
        recipeYield: data.recipeYield,
        recipeInstructions: data.recipeInstructions,
        keywords: data.keywords,
        reviews: data.reviews
    };

    console.log(`Downloaded ${json.name || json.headline || "N/A"}!`);
    return json;
}

// Process CONCURRENCY # of urls
async function processUrls(): Promise<RecipeData[]> {
    const results: RecipeData[] = [];
  
    const writeStream = fs.createWriteStream('carneadesData.json');
  
    for (let i = 0; i < recipeUrls.length; i += CONCURRENCY) {
        const batch = recipeUrls.slice(i, i + CONCURRENCY);
        const promises = batch.map((url) =>
        extractRecipeData(url).then(({ recipeData }) => {
            return shape_data(recipeData);
        })
        );

        try {
        const batchResults = await Promise.all(promises);
        batchResults.forEach((result) => {
            writeStream.write(JSON.stringify(result, null, 2) + '\n');
        });
        results.push(...batchResults);
        } catch (error) {
        console.error('Error:', error);
        }
    }
  
    writeStream.end();
  
    return results;
}
  
(async function () {
    const results = await processUrls();
    console.log(`All recipes downloaded.`);
})();
