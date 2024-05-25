import * as z from "zod";

export type Image = z.infer<typeof ImageSchema>;

export type Review = z.infer<typeof ReviewSchema>;

export type FoodItem = z.infer<typeof FoodItemSchema>;

export type BusinessHours = z.infer<typeof BusinessHoursSchema>;

export type Address = z.infer<typeof AddressSchema>;

export type Merchant = z.infer<typeof MerchantSchema>;

const ImageSchema = z.object({
	src: z.string(),
	alt: z.string(),
});

const ReviewSchema = z.object({
	dateExact: z.string().optional(),
	dateApprox: z.string(),
	text: z.string(),
	rating: z.number(),
	location: z.string(),
	totalUserReviewCount: z.number(),
	images: z.array(ImageSchema),
});

const FoodItemSchema = z.object({
	title: z.string(),
	images: z.array(ImageSchema.extend({ timeUploaded: z.string() })),
	reviews: z.array(
		z.object({
			text: z.string(),
			rating: z.number(),
			totalUserReviewCount: z.number(),
			date: z.string(),
		})
	),
	isDrink: z.boolean().optional(),
});

const BusinessHoursSchema = z.object({
	monday: z.string().optional(),
	tuesday: z.string().optional(),
	wednesday: z.string().optional(),
	thursday: z.string().optional(),
	friday: z.string().optional(),
	saturday: z.string().optional(),
	sunday: z.string().optional(),
});

const AddressSchema = z.object({
	address: z.string(),
	city: z.string(),
	country: z.string(),
	state: z.string(),
	zip: z.string(),
});

export const MerchantSchema = z.object({
	platform_specific_merchant_id: z.string(),
	platform_specific_merchant_name: z.string(),
	name: z.string(),
	location: z.object({
		address: AddressSchema,
		locatedIn: z.string().optional(),
	}),
	about: z.string().optional(),
	website: z.string().optional(),
	phoneNumber: z.string(),
	dollarRating: z.string(),
	hours: BusinessHoursSchema,
	reviews: z.array(ReviewSchema),
	foodItems: z.array(FoodItemSchema),
	categories: z.array(z.string()),
	type: z.string(),
});
