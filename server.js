
require("dotenv").config();
const express=require("express");
const path=require("path");
const Database=require("better-sqlite3");
const multer=require("multer");
const app=express();
const PORT=Number(process.env.PORT||3000);
const db=new Database(path.join(__dirname,"data","kiri.db"));
const upload=multer({dest:path.join(__dirname,"uploads")});
app.use(express.json({limit:"2mb"})); app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));

db.exec(`CREATE TABLE IF NOT EXISTS orders(
id INTEGER PRIMARY KEY AUTOINCREMENT,telegram_id TEXT,customer_name TEXT,phone TEXT,
mode TEXT NOT NULL,address TEXT,delivery_fee REAL DEFAULT 0,currency TEXT NOT NULL,
subtotal REAL NOT NULL,total REAL NOT NULL,items_json TEXT NOT NULL,payment_method TEXT,
payment_reference TEXT,payment_proof TEXT,status TEXT NOT NULL DEFAULT 'Payment Checking',
customer_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

const products=[
{id:1,name:"Hot Latte",category:"Coffee",hot:true,small:1.25,large:2},
{id:2,name:"Iced Latte",category:"Coffee",hot:false,small:1.5,large:2.25},
{id:3,name:"Hot Matcha Latte",category:"Matcha",hot:true,small:1.25,large:2},
{id:4,name:"Matcha Latte",category:"Matcha",hot:false,small:1.5,large:2.25}
];

app.get("/api/products",(req,res)=>res.json(products));
app.get("/api/config",(req,res)=>res.json({
shopName:process.env.SHOP_NAME||"Kiri Coffee and Food",
categories:["Coffee","Matcha","Tea & Soda","Smoothies","Food"],
temperatures:["Hot","Cold"],
cupSizes:["Small","Large"],
sugarLevels:["25%","50%","75%","100%"],
extras:[{name:"Extra espresso",priceUSD:.5},{name:"Extra Matcha",priceUSD:.75}],
currencies:["USD","KHR"],orderModes:["Pickup","Delivery"],
paymentMethods:["Bakong","ABA","ACLEDA","Wing","Other"],
delivery:{mode:"distance-based"},
payment:{
accountName:process.env.PAYMENT_ACCOUNT_NAME||"Kiri Food by D.TEP",
bakong:process.env.BAKONG_ACCOUNT||"003268411",
abaKHR:process.env.ABA_KHR_ACCOUNT||"003268411",
abaUSD:process.env.ABA_USD_ACCOUNT||"000729100",
qr:"/payment-qr.png"
},
adminUsername:process.env.ADMIN_TELEGRAM_USERNAME||"Kiri"
}));

app.post("/api/orders",upload.single("paymentProof"),(req,res)=>{
try{
const b=req.body,items=JSON.parse(b.items||"[]");
if(!Array.isArray(items)||!items.length)return res.status(400).json({error:"Cart is empty"});
if(!["Pickup","Delivery"].includes(b.mode))return res.status(400).json({error:"Invalid order mode"});
if(b.mode==="Delivery"&&!String(b.address||"").trim())return res.status(400).json({error:"Delivery address is required"});
const subtotal=Number(b.subtotal),deliveryFee=Number(b.deliveryFee||0),total=Number(b.total);
if(![subtotal,deliveryFee,total].every(Number.isFinite))return res.status(400).json({error:"Invalid totals"});
const r=db.prepare(`INSERT INTO orders(telegram_id,customer_name,phone,mode,address,delivery_fee,currency,subtotal,total,items_json,payment_method,payment_reference,payment_proof,status,customer_message)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
b.telegramId||"",b.customerName||"Telegram Customer",b.phone||"",b.mode,b.address||"",deliveryFee,b.currency||"USD",
subtotal,total,JSON.stringify(items),b.paymentMethod||"",b.paymentReference||"",req.file?req.file.path:"","Payment Checking",b.message||"");
res.json({ok:true,orderId:r.lastInsertRowid,status:"Payment Checking"});
}catch(e){console.error(e);res.status(500).json({error:"Could not create order"})}
});

function auth(req,res,next){
if(req.headers["x-admin-user"]!==(process.env.ADMIN_USERNAME||"Kiri")||req.headers["x-admin-pass"]!==(process.env.ADMIN_PASSWORD||"CHANGE_ME"))
return res.status(401).json({error:"Unauthorized"}); next();
}
app.get("/api/admin/orders",auth,(req,res)=>res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 300").all()));
app.patch("/api/admin/orders/:id",auth,(req,res)=>{
const allowed=["Payment Checking","Confirmed","Preparing","Ready","Completed","Cancelled","Payment Rejected"];
if(!allowed.includes(req.body.status))return res.status(400).json({error:"Invalid status"});
db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);res.json({ok:true});
});
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.listen(PORT,()=>console.log("Kiri Coffee running on http://localhost:"+PORT));
