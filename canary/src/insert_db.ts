import fs from "fs";
import { Merchant, MerchantSchema } from "./ideal_types";
import sql from "mssql";
import axios from "axios";

const config: sql.config = {
	user: "SA",
	password: process.env.PASSWORD,
	server: "192.168.10.22",
	database: "IRON0002",
	options: {
		trustServerCertificate: true,
	},
};

async function main() {
	const OUTPUT_FILE = process.env.OUTPUT_FILE;
	if (!OUTPUT_FILE) throw new Error("env OUTPUT_FILE not provided");
	const directoryPath = process.env.DIRECTORY_PATH;
	if (!directoryPath) throw new Error("env DIRECTORY_PATH not provided");

	const visitedFiles = new Set<string>();
	fs.readFileSync(OUTPUT_FILE, "utf-8")
		.split("\n")
		.forEach((line) => {
			visitedFiles.add(line);
		});
	fs.readdir(directoryPath, async (err, files) => {
		if (err) {
			console.error("Error reading directory:", err);
			return;
		}
		const pool = await sql.connect(config);
		try {
			for (const file of files) {
				if (visitedFiles.has(file)) continue;
				console.log(`Visiting file ${file}`);
				const data = fs.readFileSync(directoryPath + "/" + file);
				const json = MerchantSchema.parse(JSON.parse(data.toString()));
				try {
					await insertMerchant(json);
					visitedFiles.add(file);
				} catch (e) {}
			}
		} finally {
			fs.appendFileSync(OUTPUT_FILE, [...visitedFiles.values()].join("\n"));
			await pool.close();
		}
	});
}

const INSERTION_METHOD = "PrestonScriptV1";

main().catch(console.error);

async function insertMerchant(merchant: Merchant) {
	const transaction = await new sql.Transaction().begin();
	// Logs will be printed if an error occurs
	const logs: string[] = [];
	console.log(`Inserting merchant ${merchant.name}`);
	try {
		const existingMerchantTypePrimaryQuery = `SELECT Merchant_Type_Primary_ID FROM Merchant_Type_Primary WHERE Name = @Name`;
		const existingMerchantTypePrimaryRequest = new sql.Request(transaction);
		existingMerchantTypePrimaryRequest.input(
			"Name",
			sql.VarChar,
			merchant.type
		);
		const existingMerchantTypePrimaryResult =
			await existingMerchantTypePrimaryRequest.query(
				existingMerchantTypePrimaryQuery
			);

		let merchantTypePrimaryId: number;
		if (existingMerchantTypePrimaryResult.recordset.length > 0) {
			merchantTypePrimaryId =
				existingMerchantTypePrimaryResult.recordset[0].Merchant_Type_Primary_ID;
			logs.push(
				`Existing merchant type primary found with ID ${merchantTypePrimaryId}.`
			);
		} else {
			// Get the MerchantTypePrimary_ID of the inserted row
			const merchantTypePrimaryQuery = `INSERT INTO Merchant_Type_Primary (Name, Description, Date_Added, How_Added) OUTPUT INSERTED.Merchant_Type_Primary_ID
      VALUES (@Name, @Description, @DateAdded, @HowAdded)`;
			const merchantTypePrimaryRequest = new sql.Request(transaction);
			merchantTypePrimaryRequest.input("Name", sql.VarChar, merchant.type);
			merchantTypePrimaryRequest.input("Description", sql.VarChar, null);
			merchantTypePrimaryRequest.input("DateAdded", sql.Date, new Date());
			merchantTypePrimaryRequest.input(
				"HowAdded",
				sql.VarChar,
				INSERTION_METHOD
			);
			const merchantTypePrimaryIdResult =
				await merchantTypePrimaryRequest.query(merchantTypePrimaryQuery);
			merchantTypePrimaryId =
				merchantTypePrimaryIdResult.recordset[0].Merchant_Type_Primary_ID;
			logs.push(
				`New merchant type primary inserted with ID ${merchantTypePrimaryId}.`
			);
		}

		// Insert into Merchant
		const merchantRequest = new sql.Request(transaction);
		merchantRequest.input("Name", sql.VarChar, merchant.name);
		merchantRequest.input(
			"MerchantTypePrimaryID",
			sql.BigInt,
			merchantTypePrimaryId
		);
		merchantRequest.input(
			"LocationAddress",
			sql.VarChar,
			merchant.location.address.address
		);
		merchantRequest.input(
			"LocatedIn",
			sql.VarChar,
			merchant.location.locatedIn
		);
		merchantRequest.input("City", sql.VarChar, merchant.location.address.city);
		merchantRequest.input(
			"State",
			sql.VarChar,
			merchant.location.address.state
		);
		merchantRequest.input(
			"ZipCode",
			sql.VarChar,
			merchant.location.address.zip
		);
		merchantRequest.input(
			"Country",
			sql.VarChar,
			merchant.location.address.country
		);
		merchantRequest.input("AboutBusiness", sql.VarChar, merchant.about);
		merchantRequest.input("Website", sql.VarChar, merchant.website);
		merchantRequest.input("PhoneNumber", sql.VarChar, merchant.phoneNumber);
		merchantRequest.input(
			"DollarSignRating",
			sql.VarChar,
			merchant.dollarRating
		);
		merchantRequest.input("HoursMonday", sql.VarChar, merchant.hours.monday);
		merchantRequest.input("HoursTuesday", sql.VarChar, merchant.hours.tuesday);
		merchantRequest.input(
			"HoursWednesday",
			sql.VarChar,
			merchant.hours.wednesday
		);
		merchantRequest.input(
			"HoursThursday",
			sql.VarChar,
			merchant.hours.thursday
		);
		merchantRequest.input("HoursFriday", sql.VarChar, merchant.hours.friday);
		merchantRequest.input(
			"HoursSaturday",
			sql.VarChar,
			merchant.hours.saturday
		);
		merchantRequest.input("HoursSunday", sql.VarChar, merchant.hours.sunday);

		const merchantQuery = `INSERT INTO Merchant (Name, Merchant_Type_Primary_ID, Location_Address, Located_In, City, State, Zip_Code, Country, About_Business, Website, Phone_Number, Dollar_Sign_Rating, Hours_Monday, Hours_Tuesday, Hours_Wednesday, Hours_Thursday, Hours_Friday, Hours_Saturday, Hours_Sunday) OUTPUT INSERTED.Merchant_ID
                            VALUES (@Name, @MerchantTypePrimaryID, @LocationAddress, @LocatedIn, @City, @State, @ZipCode, @Country, @AboutBusiness, @Website, @PhoneNumber, @DollarSignRating, @HoursMonday, @HoursTuesday, @HoursWednesday, @HoursThursday, @HoursFriday, @HoursSaturday, @HoursSunday)`;
		const merchantIdResult = await merchantRequest.query(merchantQuery);
		const merchantId = merchantIdResult.recordset[0].Merchant_ID;

		logs.push(`Merchant inserted successfully with ID ${merchantId}.`);

		// Insert into MerchantCategoryPrimary
		for (const category of merchant.categories) {
			const existingMerchantCategoryPrimaryQuery = `SELECT Category_Content_Primary_ID FROM Category_Content_Primary WHERE Name = @Name`;
			const existingMerchantCategoryPrimaryRequest = new sql.Request(
				transaction
			);
			existingMerchantCategoryPrimaryRequest.input(
				"Name",
				sql.VarChar,
				category
			);
			const existingMerchantCategoryPrimaryResult =
				await existingMerchantCategoryPrimaryRequest.query(
					existingMerchantCategoryPrimaryQuery
				);

			let merchantCategoryPrimaryId: number;
			if (existingMerchantCategoryPrimaryResult.recordset.length > 0) {
				merchantCategoryPrimaryId =
					existingMerchantCategoryPrimaryResult.recordset[0]
						.Category_Content_Primary_ID;
				logs.push(
					`Existing category found with id ${merchantCategoryPrimaryId}.`
				);
			} else {
				const merchantCategoryPrimaryQuery = `INSERT INTO Category_Content_Primary (Name, Date_Added, How_Added) OUTPUT INSERTED.Category_Content_Primary_ID
                                              VALUES (@Name, @DateAdded, @HowAdded)`;
				const merchantCategoryPrimaryRequest = new sql.Request(transaction);
				merchantCategoryPrimaryRequest.input("Name", sql.VarChar, category);
				merchantCategoryPrimaryRequest.input("DateAdded", sql.Date, new Date());
				merchantCategoryPrimaryRequest.input(
					"HowAdded",
					sql.VarChar,
					INSERTION_METHOD
				);
				const merchantCategoryPrimaryIdResult =
					await merchantCategoryPrimaryRequest.query(
						merchantCategoryPrimaryQuery
					);
				// Get the Category_Content_Primary_ID of the inserted row
				merchantCategoryPrimaryId =
					merchantCategoryPrimaryIdResult.recordset[0]
						.Category_Content_Primary_ID;
				logs.push(
					`New category inserted with id ${merchantCategoryPrimaryId}.`
				);
			}

			// Insert into whatever joins categories and merchants
			const merchantCategoryRequest = new sql.Request(transaction);
			merchantCategoryRequest.input("MerchantID", sql.BigInt, merchantId);
			merchantCategoryRequest.input(
				"CategoryContentPrimaryID",
				sql.BigInt,
				merchantCategoryPrimaryId
			);
			merchantCategoryRequest.input("DateAdded", sql.Date, new Date());
			merchantCategoryRequest.input("HowAdded", sql.VarChar, INSERTION_METHOD);

			const merchantCategoryQuery = `INSERT INTO Merchant_Category_Content (Merchant_ID, Category_Content_Primary_ID, Date_Added, How_Added)
                                      VALUES (@MerchantID, @CategoryContentPrimaryID, @DateAdded, @HowAdded)`;
			await merchantCategoryRequest.query(merchantCategoryQuery);
			logs.push(`Merchant category inserted successfully.`);
		}

		logs.push("Merchant categories inserted successfully");

		// Insert into ReviewDataset (which is just reviews)
		for (let i = 0; i < merchant.reviews.length; i++) {
			const review = merchant.reviews[i]!;
			const reviewRequest = new sql.Request(transaction);
			reviewRequest.input("MerchantID", sql.BigInt, merchantId);
			reviewRequest.input("ReviewNumber", sql.BigInt, i);
			reviewRequest.input("DataSource", sql.VarChar, "YELP");
			reviewRequest.input("ReviewText", sql.VarChar, review.text);
			reviewRequest.input(
				"ReviewLastUpdate",
				sql.VarChar,
				review.dateExact || review.dateApprox
			);
			reviewRequest.input("ReviewRating", sql.Int, review.rating);
			reviewRequest.input("ReviewerNumber", sql.VarChar, "UNKNOWN"); // Non null?
			reviewRequest.input("ReviewerLocation", sql.VarChar, review.location);
			reviewRequest.input(
				"ReviewerReviewNumber",
				sql.BigInt,
				review.totalUserReviewCount
			);
			reviewRequest.input("ReviewerStatus", sql.VarChar, null);
			reviewRequest.input(
				"ReviewDate",
				sql.VarChar,
				review.dateExact || review.dateApprox
			);
			reviewRequest.input("DateAdded", sql.Date, new Date());
			reviewRequest.input("HowAdded", sql.VarChar, INSERTION_METHOD);

			const reviewQuery = `INSERT INTO Review (Merchant_ID, Review_Number, Data_Source, Review_Text, Review_Last_Update, Review_Rating, Reviewer_Number, Reviewer_Location, Reviewer_Review_Number, Reviewer_Status, Review_Date, Date_Added, How_Added) OUTPUT INSERTED.Review_ID
                            VALUES (@MerchantID, @ReviewNumber, @DataSource, @ReviewText, @ReviewLastUpdate, @ReviewRating, @ReviewerNumber, @ReviewerLocation, @ReviewerReviewNumber, @ReviewerStatus, @ReviewDate, @DateAdded, @HowAdded)`;
			const reviewIdResult = await reviewRequest.query(reviewQuery);
			const reviewId = reviewIdResult.recordset[0].Review_ID;

			logs.push(`Review inserted successfully with ID ${reviewId}.`);

			// Insert into ReviewImages
			for (const image of review.images) {
				const imageId = await insertImage(
					image.src,
					image.alt,
					INSERTION_METHOD,
					transaction,
					logs
				);
				const reviewImagesRequest = new sql.Request(transaction);
				reviewImagesRequest.input("ImageID", sql.BigInt, imageId);
				reviewImagesRequest.input("ReviewID", sql.BigInt, reviewId);
				reviewImagesRequest.input("Subtitle", sql.VarChar, image.alt);
				reviewImagesRequest.input("DateAdded", sql.Date, new Date());
				reviewImagesRequest.input("HowAdded", sql.VarChar, INSERTION_METHOD);

				const reviewImagesQuery = `INSERT INTO Review_Images (Image_ID, Review_ID, Subtitle, Date_Added, How_Added)
                                    VALUES (@ImageID, @ReviewID, @Subtitle, @DateAdded, @HowAdded)`;
				await reviewImagesRequest.query(reviewImagesQuery);
				logs.push(
					`Review image inserted successfully with image ID ${imageId}.`
				);
			}
		}

		logs.push("Merchant reviews inserted successfully");

		// Insert into Item
		for (let i = 0; i < merchant.foodItems.length; i++) {
			const item = merchant.foodItems[i]!;
			const itemRequest = new sql.Request(transaction);
			itemRequest.input("MerchantID", sql.BigInt, merchantId);
			itemRequest.input("ItemTitle", sql.VarChar, item.title);
			itemRequest.input("ItemNumber", sql.BigInt, i);

			const itemQuery = `INSERT INTO Item (Merchant_ID, Item_Title, Item_Number) OUTPUT INSERTED.Item_ID
                          VALUES (@MerchantID, @ItemTitle, @ItemNumber)`;
			const itemIdResult = await itemRequest.query(itemQuery);
			const itemId = itemIdResult.recordset[0].Item_ID;

			// Insert into ItemImages
			for (const image of item.images) {
				const imageId = await insertImage(
					image.src,
					image.alt,
					INSERTION_METHOD,
					transaction,
					logs
				);
				const itemImagesRequest = new sql.Request(transaction);
				itemImagesRequest.input("ImageID", sql.BigInt, imageId);
				itemImagesRequest.input("ItemID", sql.BigInt, itemId);
				itemImagesRequest.input("DateAdded", sql.Date, new Date());
				itemImagesRequest.input("HowAdded", sql.VarChar, INSERTION_METHOD);

				const itemImagesQuery = `INSERT INTO Item_Images (Image_ID, Item_ID, Date_Added, How_Added)
                                  VALUES (@ImageID, @ItemID, @DateAdded, @HowAdded)`;
				await itemImagesRequest.query(itemImagesQuery);
			}
		}
		console.log("Merchant inserted successfully");
		await transaction.commit();
	} catch (err) {
		console.log(logs.join("\n"));
		console.error(err);
		await transaction.rollback();
		console.log("Transaction rolled back");
		throw err;
	}
}

async function fetchImageBinary(url: string): Promise<Buffer> {
	const response = await axios.get(url, {
		responseType: "arraybuffer",
	});
	return Buffer.from(response.data, "binary");
}

async function insertImage(
	url: string,
	subtitle: string,
	howAdded: string,
	transaction: sql.Transaction,
	logs: string[]
): Promise<number> {
	await sql.connect(config);
	const imageBuffer = await fetchImageBinary(url);

	const request = new sql.Request(transaction);
	request.input("ImageData", sql.VarBinary, imageBuffer);
	request.input("Subtitle", sql.VarChar, subtitle);
	request.input("DateAdded", sql.Date, new Date());
	request.input("HowAdded", sql.VarChar, howAdded);
	request.input("Format", sql.VarChar, url.split(".").pop() ?? null);

	const query = `INSERT INTO Images (Image_Data, Subtitle, Date_Added, How_Added) OUTPUT INSERTED.Images_ID
                  VALUES (@ImageData, @Subtitle, @DateAdded, @HowAdded)`;
	const result = await request.query(query);
	logs.push(
		`Image inserted successfully with ID ${result.recordset[0].Images_ID}.`
	);
	return result.recordset[0].Images_ID;
}
