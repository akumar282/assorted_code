const iterate = (obj: any, callback: (key: string, value: unknown) => void) => {
	for (var property in obj) {
		if (obj.hasOwnProperty(property)) {
			if (typeof obj[property] == "object") {
				iterate(obj[property], callback);
			} else {
				callback(property, obj[property]);
			}
		}
	}
};

export const extractNewBiz = (data: any) => {
	const nextBiz: string[] = [];
	iterate(data, (key, value) => {
		if (key === "businessUrl" && typeof value === "string") {
			if (value.startsWith("/biz")) {
				value = "https://www.yelp.com" + value;
			}
			const bizUrl = (value as string).match(/https.+\/biz\/[^?#\/]+/);
			if (bizUrl && bizUrl[0]) {
				const biz = bizUrl[0].toString().split("/").at(-1);
				if (biz) {
					nextBiz.push(biz);
				}
			}
		}
	});
	return nextBiz;
};
