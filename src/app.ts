import {
    MongoClient,
} from "https://deno.land/x/atlas_sdk@v1.1.2/mod.ts";

import {
    Req,
    Res,
    Router,
    WebApp,
    bodyParse
} from "https://deno.land/x/denorest@v4.2/mod.ts";

interface AccData {
    userId: string;
    date: string;
    accData: number;
}

const json = await Deno.readTextFile("./src/auth.txt");
const config = JSON.parse(json);
const url = config.url;
const api = config.apiKey;

const client = new MongoClient({
    endpoint: url,
    dataSource: "recordAccelCluster", // e.g. "Cluster0"
    auth: {
        apiKey: api
    }
});
const DB = client.database("recordAccelDB");
const ACCDATACOL = DB.collection<AccData>("recordAccelCol");
const KV = await Deno.openKv();

async function loadAccData(userId: string): Promise<AccData[]> {
}

async function insertAccData(accData: AccData[]) {
    const userId = accData[0].userId;
    // userIDをdenoのKVデータベースに記録する
    await KV.set(["users", userId], userId);
    await ACCDATACOL.insertMany(accData);
}

// 入力の型チェック
function convertAccData(arg: any): AccData | null {
    if (typeof arg !== "object" &&
        typeof arg.date === "string" &&
            typeof arg.userId === "string" &&
                typeof arg.accData === "number" ||
                    !arg.date ||
                        !arg.userId ||
                            !arg.accData
       ) {
           return null
       }
       return {
           userId: arg.userId,
           date: arg.date,
           accData: arg.accData
       }
}

const app = new WebApp();
const router = new Router();
const USER_ROOT = new URLPattern({ pathname: "/userId/:id" });

router.get("/userId/:id", async (req: Req, res: Res) => {
    const match = USER_ROOT.exec(req.url);
    if (!match) {
        res.reply = {status: 400, message: "don't match url pattern"}
        return
    }
    const userId = match.pathname.groups.id;
    if (userId) {
        const userAccData = await loadAccData(userId);
        res.reply = userAccData;
    } else {
        res.reply = {status: 400, message: `userId: ${userId} not found`}
    }
});

router.post("/", async (req: Req, res: Res) => {
    const data = await bodyParse(req);
    const json = JSON.parse(data.text);
    let accData: AccData[]
    if (Array.isArray(json)) {
        accData = json.map(data => convertAccData(data))
        .filter(accData => accData);
    } else {
        accData = [convertAccData(json)].filter(data => data);
    }

    if (accData.length > 0) {
        insertAccData(accData);
    } else {
        res.reply = {status: 400, message: "userId or data is not valid"}
    }
});

app.set(router);
app.listen(8080);
