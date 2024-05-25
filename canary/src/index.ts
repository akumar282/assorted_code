import fs from "fs";
import path from "path";
import { createClient } from "redis";
import { fetchData } from "./url_parsing";

// For redis.
const UNSEEN_NAMES = "unseen_names";
const SEEN_NAMES = "seen_names";

const main = async () => {
	const outDir = process.env.OUT_DIR;
	if (!outDir) throw new Error("env OUT_DIR not provided");
	const client = createClient({
		url: process.env.REDIS_URL,
	});
	client.on("error", console.error);
	await client.connect();

	try {
		while (true) {
			const [name] = await client.sPop(UNSEEN_NAMES, 1);
			if (!name) {
				console.log("No names found, exiting process.");
				return;
			}
			const { nextUrls: nextNames, merchantData } = await fetchData(name);
			if (!merchantData) {
				await client.sAdd(UNSEEN_NAMES, name);
				continue;
			}
			fs.writeFile(
				path.join(outDir, b64(name) + ".json"),
				JSON.stringify(merchantData, null, 2),
				(err) =>
					err ? console.error(err) : console.log("Wrote", name, "to disk.")
			);
			await client.sAdd(SEEN_NAMES, name);
			const newNamesToWrite = Promise.all(
				nextNames.map(async (name) => {
					const exists = await client.sIsMember(SEEN_NAMES, name);
					if (!exists) {
						await client.sAdd(UNSEEN_NAMES, name);
					}
				})
			);
			// If no elements in set, wait for new names to be set.
			if ((await client.sCard(UNSEEN_NAMES)) == 0) {
				await newNamesToWrite;
			}
		}
	} finally {
		client.disconnect();
	}
};

const b64 = (s: string) => Buffer.from(s).toString("base64");

main().catch(console.error);
