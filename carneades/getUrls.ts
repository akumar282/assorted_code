import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function scrapeData(page: Page, pageNum: number, retryCount = 2): Promise<string[]> {
    try {
        // User agent needed to scrape from Carneades
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537');
        await page.goto(`https://www.epicurious.com/search?content=recipe&page=${pageNum}`);

        await page.waitForSelector('.recipe-content-card');
        
    } catch (error) {

        // Retry page again before moving on to next url
        console.error(`Failed to navigate to page ${pageNum}`);
        if (retryCount > 0) {
            console.log(`Retrying page ${pageNum}, attempts left: ${retryCount}`);
            return await scrapeData(page, pageNum, retryCount - 1);
        } else {
            return [];
        }
    }

    const results = await page.evaluate(() => {
        const groupElements = Array.from(document.querySelectorAll('.recipe-content-card'));
        const data: string[] = [];

        // Gets recipe url
        groupElements.forEach((recipe) => {
            const url = recipe.querySelector('a')?.href;
            if (url) data.push(url);
        });
        return data;
    });
    return results;
}

async function startScraping() {

    // Total # of recipe pages on Carneades
    // IF RUNNING AGAIN, UPDATE WITH CORRECT #
    const lastPage = 2233;
    const filePath = path.resolve(__dirname, 'carneadesUrls.json');

    const browser: Browser = await puppeteer.launch();

    const allResults: string[] = [];

    for (let i = 1; i <= lastPage; i++) {
        console.log(`Scraping page ${i}`);
        const page: Page = await browser.newPage();
        const results = await scrapeData(page, i);
        allResults.push(...results);
        await page.close();
        // Write all the results to the file after each page
        fs.writeFileSync(filePath, JSON.stringify(allResults, null, 2));
    }

    await browser.close();
}

startScraping();
