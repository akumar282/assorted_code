import axios from "axios";
import parse from "node-html-parser";
import { CanaryEmbeddedJson, CanaryProps, FoodItems } from "./canary_types";
import { extractNewBiz } from "./extract_new_names";
import { FoodItem, Merchant } from "./ideal_types";

const URL_PREFIX = "https://www.yelp.com";

const fetchFoodItemByName = async (bizName: string, foodName: string) => {
	// Remap some special characters.
	const encodedName = foodName
		.toLowerCase()
		.replaceAll(" ", "%20")
		.replaceAll("&#x27;", "'")
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", "%22");
	const fetchItem = async (isDrink: boolean) => {
		// E.g. https://www.yelp.com/popular_dish/zBYwHQHR5aE3uHgAP0b3tw/food/chicken%20wings
		const { data } = await axios.get<FoodItems.FoodItem>(
			URL_PREFIX +
				"/popular_dish/" +
				bizName +
				(isDrink ? "/drink/" : "/food/") +
				encodedName,
			{
				headers: {
					accept: "application/json",
					"cache-control": "no-cache",
					"content-type": "application/json",
					pragma: "no-cache",
					"x-requested-with": "XMLHttpRequest",
					Referer: "https://www.yelp.com/biz/" + bizName,
					"Referrer-Policy": "strict-origin-when-cross-origin",
				},
			}
		);
		return data;
	};

	try {
		// Most things are food, so try that first.
		return await fetchItem(false);
	} catch (e) {
		return { ...(await fetchItem(true)), isDrink: true };
	}
};

const fetchFoodItemByUrl = async (
	bizName: string,
	bizId: string,
	foodUrl: string
) => {
	const { data } = await axios.get<FoodItems.FoodItem>(
		// E.g. https://www.yelp.com/popular_dish/zBYwHQHR5aE3uHgAP0b3tw/menu/chicken-wings
		URL_PREFIX +
			"/popular_dish/" +
			bizId +
			"/menu/" +
			foodUrl.split("/").at(-1)!,
		{
			headers: {
				accept: "application/json",
				"cache-control": "no-cache",
				"content-type": "application/json",
				pragma: "no-cache",
				"sec-ch-ua-mobile": "?0",
				"sec-fetch-dest": "empty",
				"sec-fetch-mode": "cors",
				"sec-fetch-site": "same-origin",
				"sec-gpc": "1",
				"x-requested-with": "XMLHttpRequest",
				Referer: "https://www.yelp.com/biz/" + bizName,
				"Referrer-Policy": "strict-origin-when-cross-origin",
			},
		}
	);
	return data;
};

// Returning undefined means that the data could not be fetched, but should
// be tried again later.
const extractMerchantData = async (
	rawProps: CanaryProps,
	pageHtml: string,
	name: string
): Promise<Merchant | undefined> => {
	const props = rawProps.bizDetailsPageProps;
	const html = parse(pageHtml);
	// There are a number of JSON files embedded in the html of the page.
	// All the important info has a "@type" property of "Restaurant"
	const data = html
		.querySelectorAll('script[type="application/ld+json"]')
		.map((raw) => {
			try {
				const rawText = raw.childNodes[0]?.rawText;
				if (!rawText) return false;
				const data: CanaryEmbeddedJson = JSON.parse(rawText);
				return data["@type"] === "Restaurant" ? data : false;
			} catch (e) {
				return false;
			}
		})
		.filter((d) => !!d)[0] as CanaryEmbeddedJson;
	if (!data) {
		console.error("Failed to find json for", name);
		return undefined;
	}

	// Categories can be easily parsed by checking the link labels.
	// They are stored as: "Find more <<category>> near <<business>>"
	const categories = props.seoLinksProps.nearbySearchInternalLinks.links
		.map((l) => l.label.match(/(?<=Find more ).+(?= near)/)?.[0])
		.filter((category, i) => {
			if (category) return true;
			console.log(
				"Failed to parse category from",
				props.seoLinksProps.nearbySearchInternalLinks.links[i]?.label
			);
			return false;
		}) as string[];

	// Contains the human readable version of the food. E.g: "Chicken wings"
	const foodTextNodes = html.querySelectorAll(
		'section[aria-label="Menu"] div[data-testid="scroll-container"] p'
	);
	// Contains the link to the food item. If the href is "javascript:;", then it
	// needs to be fetched via fetchFoodItemByName. If it is a url, then it needs
	// to be fetched with fetchFoodItemByUrl.
	const foodLinkNodes = html.querySelectorAll(
		'section[aria-label="Menu"] div[data-testid="scroll-container"] a'
	);
	const foodItemRequests: Promise<FoodItem>[] = foodTextNodes.map(
		async (node, i) => {
			let foodItemData: FoodItems.FoodItem;
			const maybeUrl = foodLinkNodes[i]?.getAttribute("href");
			if (maybeUrl?.startsWith("http")) {
				foodItemData = await fetchFoodItemByUrl(
					name,
					props.businessId,
					maybeUrl
				);
			} else {
				foodItemData = await fetchFoodItemByName(name, node.innerText);
			}
			return {
				title: node.innerText,
				images: foodItemData.mediaItems.map((i) => ({
					timeUploaded: i.timeUploaded,
					alt: i.caption,
					src: i.url,
				})),
				reviews:
					foodItemData.reviewData?.reviews.map((r) => ({
						text: r.text,
						totalUserReviewCount: r.userReviewCount,
						rating: r.rating,
						date: r.date,
					})) || [],
				isDrink: foodItemData.isDrink,
			};
		}
	);
	const foodItems = await Promise.all(foodItemRequests);

	const website = html
		// Gets the first paragraph tag after a paragraph with the text "Business website"
		.querySelectorAll("p+p")
		.find((n) => n.previousSibling.innerText === "Business website")
		?.childNodes[0]?.innerText;

	const locatedIn = html
		// Gets the first paragraph tag after a paragraph with the text "Located in"
		.querySelectorAll("p+p")
		.find((n) => n.previousSibling.innerText === "Located in:")
		?.childNodes[0]?.innerText;

	const openHours = html
		.querySelectorAll("table tbody tr td ul li p")
		.map((p) => p.innerText);

	return {
		platform_specific_merchant_id: props.businessId,
		platform_specific_merchant_name: name,
		name: props.businessName,
		about:
			props.fromTheBusinessProps?.fromTheBusinessContentProps.specialtiesText,
		reviews: props.reviewFeedQueryProps.reviews.map((review, i) => ({
			dateExact: data.review?.[i]?.datePublished,
			dateApprox: review.localizedDate,
			text: review.comment.text,
			rating: review.rating,
			location: review.user.displayLocation,
			totalUserReviewCount: review.user.reviewCount,
			images: review.photos.map((p) => ({ src: p.src, alt: p.altText })),
		})),
		location: {
			address: {
				address: data.address.streetAddress,
				state: data.address.addressRegion,
				country: data.address.addressCountry,
				zip: data.address.postalCode,
				city: data.address.addressLocality,
			},
			locatedIn,
		},
		phoneNumber: data.telephone,
		dollarRating: data.priceRange,
		type: data["@type"],
		categories,
		foodItems,
		website,
		hours: {
			monday: openHours[0],
			tuesday: openHours[1],
			wednesday: openHours[2],
			thursday: openHours[3],
			friday: openHours[4],
			saturday: openHours[5],
			sunday: openHours[6],
		},
	};
};

export const fetchData = async (name: string) => {
	const pageUrl = URL_PREFIX + "/biz/" + name;
	const propsUrl = pageUrl + "/props";
	const { data: propsData } = await axios.get<CanaryProps>(propsUrl);
	const { data: pageHtml } = await axios.get<string>(pageUrl);
	return {
		nextUrls: extractNewBiz(propsData),
		merchantData: await extractMerchantData(propsData, pageHtml, name),
	};
};
