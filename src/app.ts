import { load } from "https://deno.land/std@0.216.0/dotenv/mod.ts";

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
    date: Date;
    accData: number;
}

await load({export: true})
const api = Deno.env.get("MONGO_APIKEY");
const url = Deno.env.get("MONGO_ENDPOINT");

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

async function loadAccData(userId: string, date: string): Promise<AccData[]> {
    // その日の0 ~ 24時までを集計する
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 0)
    const data = await ACCDATACOL.aggregate([
        { $match: {
            "userId": userId,
            "date": {
                $gte: dayStart,
                $lt: dayEnd
            }
        } },
        { $group: {_id: "$userId", dates: {$push: {date: "$date"}}}},
    ]);
    return data
}

async function loadDateList(userId: string, pageNumber: number): Promise<string[]> {
    // 一度に取れる量を制限する
    const pageSize = 7;
    const dateDatas = await ACCDATACOL.aggregate([
        { $match: {"userId": userId} },
        { $group: {_id: "$userId", dates: {$addToSet: {
            $dateToString: {format: "%Y-%m-%d", date: "$date"}
        }}}},
    ]).catch(err => {
        console.log(err);
    });
    let sendData = dateDatas[0]["dates"].sort()

    return sendData.slice(pageSize * pageNumber, pageSize * pageNumber + pageSize)
}

async function insertAccData(accData: AccData[]) {
    const userId = accData[0].userId;
    // userIDをdenoのKVデータベースに記録する
    await KV.set(["users", userId], userId);
    await ACCDATACOL.insertMany(accData);
}

async function isRegisterUser(userId: string): Promise<boolean> {
    const user = await KV.get(["users", userId]);
    return user.value == userId
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
           date: new Date(arg.date),
           accData: arg.accData
       }
}

const app = new WebApp();
const router = new Router();

router.get("/", async (req: Req, res: Res) => {
    const params = req.url?.searchParams;
    if (!params) {
        res.reply = {status: 400, message: "don't match url pattern"}
        return
    }
    const userId = params.get("userId");
    const date = params.get("date");
    if (userId && date) {
        const userAccData = await loadAccData(userId, date);
        res.reply = userAccData;
    } else {
        res.reply = {status: 400, message: `userId or date not found`}
    }
});

router.get("/date", async (req: Req, res: Res) => {
    const params = req.url?.searchParams;
    if (!params) {
        res.reply = {status: 400, message: "don't match url pattern"}
        return
    }
    const userId = params.get("userId");
    const pageNumber = Number(params.get("pageNumber"));
    if (userId && !Number.isNaN(pageNumber)) {
        const dates = await loadDateList(userId, pageNumber);
        res.reply = dates;
    } else {
        res.reply = {status: 400, message: `userId or pageNumber not found`}
    }
});

// 含まれていたら、追加する
router.get("/checkUser", async (req: Req, res: Res) => {
    const params = req.url?.searchParams;
    if (!params) {
        res.reply = {status: 400, message: "don't match url pattern"}
        return
    }
    const userId = params.get("userId");
    if (userId) {
        res.reply = await isRegisterUser(userId);
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
