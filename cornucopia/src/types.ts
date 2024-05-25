export interface breadcrumb {
  url: string,
  href: string,
  name: string
}

export interface menuItem {
  itemName: string,
  price: number,
  description: string,
  category: string,
  categoryDescription: string,
  restaurantPN: string,
  restaurantName: string,
  address: string,
  menuUrl: string
}

export interface merchant {
  merchant_name: string,
  merchant_address: string,
  merchant_phone: string,
  merchant_country: string,
  merchant_date_added: Date,
  merchant_how_added: string,
  merchant_website: string
}

export interface foodItem { 
  food_item_title: string,
  food_category: string,
  date_added: Date,
  how_added: string
}