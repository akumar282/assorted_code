import sql from 'mssql'
import { menuItem, merchant, foodItem } from './types';

const config: sql.config = {
  user: "SA",
  password: process.env.PASSWORD,
  server: "192.168.10.22",
  database: "IRON0004TEST",
  options: {
    trustServerCertificate: true,
  },
}

const INSERTION_METHOD = "CornScript";

export async function insertItemToDb(bundle: menuItem) {
  const food_item: foodItem = {
    food_item_title: bundle.itemName,
    food_category: bundle.category,
    date_added: new Date(),
    how_added: INSERTION_METHOD
  }

  const merchant: merchant = {
    merchant_name: bundle.restaurantName,
    merchant_address: bundle.address,
    merchant_phone: bundle.restaurantPN,
    merchant_country: "USA",
    merchant_date_added: new Date(),
    merchant_how_added: INSERTION_METHOD,
    merchant_website: bundle.menuUrl
  }

  const transaction = await new sql.Transaction().begin()
  try {
    const checkForExistingMerchantQuery = `SELECT Merchant_Type_Primary_ID FROM Merchant_Type_Primary WHERE Name = @Name`

    const checkForExistingMerchantRequest = new sql.Request(transaction)
    checkForExistingMerchantRequest.input('Name', sql.VarChar, merchant.merchant_name)

    const checkForExistingMerchantResult = await checkForExistingMerchantRequest.query(checkForExistingMerchantQuery)

    let merchantId: number;
    if (checkForExistingMerchantResult.recordset.length > 0) {
      merchantId =
        checkForExistingMerchantResult.recordset[0].Merchant_ID
      const itemRequest = new sql.Request(transaction);
      itemRequest.input("Merchant_ID", sql.BigInt, merchantId)
      itemRequest.input("Item_Title", sql.VarChar, food_item.food_item_title)
      itemRequest.input("Item_Category", sql.VarChar, food_item.food_category)
      itemRequest.input("Date_Added", sql.DateTime, food_item.date_added)
      itemRequest.input("How_Added", sql.VarChar, food_item.how_added)
      const itemQuery = `INSERT INTO Food_Item (Merchant_ID, Item_Title, Item_Category, Date_Added, How_Added) VALUES (@Merchant_ID, @Item_Title, @Item_Category, @Date_Added, @How_Added)`
      const item_insert_result = await itemRequest.query(itemQuery)
    } else {
      const merchantRequest = new sql.Request(transaction);
      merchantRequest.input("Name", sql.VarChar, merchant.merchant_name)
      merchantRequest.input("Address", sql.VarChar, merchant.merchant_address)
      merchantRequest.input("Phone", sql.VarChar, merchant.merchant_phone)
      merchantRequest.input("Country", sql.VarChar, merchant.merchant_country)
      merchantRequest.input("Date_Added", sql.DateTime, merchant.merchant_date_added)
      merchantRequest.input("How_Added", sql.VarChar, merchant.merchant_how_added)
      merchantRequest.input("Website", sql.VarChar, merchant.merchant_website)
      const merchantQuery = `INSERT INTO Merchant_Type_Primary (Name, Address, Phone, Country, Date_Added, How_Added, Website) VALUES (@Name, @Address, @Phone, @Country, @Date_Added, @How_Added, @Website)`
      const merchant_insert_result = await merchantRequest.query(merchantQuery)
      merchantId = merchant_insert_result.recordset[0].Merchant_ID
      const itemRequest = new sql.Request(transaction);
      itemRequest.input("Merchant_ID", sql.BigInt, merchantId)
      itemRequest.input("Item_Title", sql.VarChar, food_item.food_item_title)
      itemRequest.input("Item_Category", sql.VarChar, food_item.food_category)
      itemRequest.input("Date_Added", sql.DateTime, food_item.date_added)
      itemRequest.input("How_Added", sql.VarChar, food_item.how_added)
      const itemQuery = `INSERT INTO Food_Item (Merchant_ID, Item_Title, Item_Category, Date_Added, How_Added) VALUES (@Merchant_ID, @Item_Title, @Item_Category, @Date_Added, @How_Added)`
      const item_insert_result = await itemRequest.query(itemQuery)
    }

  } catch (error) {
    console.error(error);
    await transaction.rollback();
    console.log("Transaction rolled back");
    throw error;
  }
}