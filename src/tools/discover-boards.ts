/**
 * Tries a list of company slugs on Greenhouse, Lever and Ashby and reports the boards that exist and have
 * India posts. Read-only, one request per second per host. New boards are printed as CSV rows to review
 * and paste into config/boards.csv. Run: npx tsx src/tools/discover-boards.ts
 */
import { userAgent } from '../agent.ts';
import { loadConfig } from '../config.ts';
import { loadEnv } from '../env.ts';
import { createHttp } from '../http.ts';
import { makeIndiaRule } from '../india.ts';
import { titleCall } from '../prefilter.ts';
import { readAshby } from '../sources/ashby.ts';
import { readGreenhouse } from '../sources/greenhouse.ts';
import { readLever } from '../sources/lever.ts';

const SLUGS = `razorpay zomato swiggy zepto zeptonow blinkit phonepe flipkart myntra sharechat mohalla unacademy dream11
dreamsports urbancompany postman browserstack chargebee hasura juspay sliceit slice khatabook cars24 spinny udaan rapido
zerodha upstox smallcase setu innovaccer whatfix lenskart nykaa olacabs physicswallah vedantu upgrad scaler interviewbit
simplilearn practo pharmeasy curefit m2p perfios darwinbox leadsquared capillary mobikwik bharatpe epifi jupiter
jupitermoney niyo kreditbee moneyview navi acko godigit policybazaar coindcx coinswitch polygon rocketlane sarvam
sarvamai krutrim zluri gupshup yellowai haptik exotel uniphore observeai verloop sprinklr lambdatest testsigma clevertap
moengage webengage netcore nobroker housing licious freshtohome bigbasket shadowfax delhivery porter blackbuck zetwerk
ofbusiness moglix jumbotail dukaan shiprocket pinelabs cashfree instamojo payu simpl getsimpl onecard cleartax dailyhunt
eruditus greatlearning masaischool newtonschool almabetter codingninjas testbook adda247 classplus teachmint cuemath
embibe pocketfm kukufm pratilipi stage seekho zupee winzo mpl games24x7 headout tracxn hackerearth unstop internshala
apna workindia superset scalerschool airmeet hubilo zoomcar bounce yulu ather olaelectric euler mfine healthifyme
tata1mg cultfit plum loop riskcovry ditto turtlemint insurancedekho cardekho droom quikr justdial indiamart tradeindia
paisabazaar bankbazaar smallcases groww cred meesho paytm`.split(/\s+/).filter(Boolean);

loadEnv();
const cfg = loadConfig();
const known = new Set(cfg.boards.map((b) => `${b.ats}:${b.token}`));
const india = makeIndiaRule(cfg.taxonomy);
const http = createHttp({ userAgent: userAgent(cfg), retries: 0, timeoutMs: 20_000 });
const readers = { greenhouse: readGreenhouse, lever: readLever, ashby: readAshby } as const;
const found: string[] = [];

await Promise.all(
  (Object.keys(readers) as (keyof typeof readers)[]).map(async (ats) => {
    for (const slug of [...new Set(SLUGS)]) {
      if (known.has(`${ats}:${slug}`)) continue;
      const r = await readers[ats](http, { ats, token: slug, company: '', on: true });
      if (!r.ok || r.jobs.length === 0) continue;
      const inIndia = r.jobs.filter((j) => india({ locations: j.locations, country: j.country, workplace: j.workplace }).isIndia);
      const entry = inIndia.filter((j) => titleCall(j.title, cfg.rules).call === 'keep').length;
      const ask = inIndia.filter((j) => titleCall(j.title, cfg.rules).call === 'ask').length;
      console.log(`found ${ats}:${slug} posts=${r.jobs.length} india=${inIndia.length} entry=${entry} ask=${ask} company="${r.jobs[0]?.company ?? ''}"`);
      if (inIndia.length >= 3) found.push(`${ats},${slug},${ats === 'greenhouse' ? '' : (r.jobs[0]?.company ?? slug)},yes`);
    }
  }),
);
console.log(`\n${found.length} new boards with 3+ India posts (paste into config/boards.csv after review):`);
for (const f of found) console.log(f);
