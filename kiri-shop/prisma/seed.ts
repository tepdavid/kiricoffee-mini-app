import { PrismaClient } from "@prisma/client";
const prisma=new PrismaClient();
async function main(){
 const hot=await prisma.category.upsert({where:{slug:"hot"},update:{},create:{name:"Hot",slug:"hot",sortOrder:1}});
 const cold=await prisma.category.upsert({where:{slug:"cold"},update:{},create:{name:"Cold",slug:"cold",sortOrder:2}});
 const menu=[["Hot Latte",hot.id,[["Small",1.25],["Large",2]]],["Iced Latte",cold.id,[["Small",1.5],["Large",2.25]]],["Matcha Latte",cold.id,[["Small",1.5],["Large",2.25]]],["Hot Matcha Latte",hot.id,[["Small",1.25],["Large",2]]]] as const;
 for(let i=0;i<menu.length;i++){const [name,categoryId,vs]=menu[i];const id="seed-"+name.toLowerCase().replace(/[^a-z0-9]+/g,"-");const p=await prisma.product.upsert({where:{id},update:{name,categoryId,isActive:true,sortOrder:i+1},create:{id,name,categoryId,sortOrder:i+1}});for(let j=0;j<vs.length;j++){const [vn,price]=vs[j];await prisma.productVariant.upsert({where:{id:`${id}-${vn.toLowerCase()}`},update:{name:vn,price,isAvailable:true,sortOrder:j+1},create:{id:`${id}-${vn.toLowerCase()}`,productId:p.id,name:vn,price,sortOrder:j+1}})}}
 await prisma.storeSetting.upsert({where:{key:"business_name"},update:{value:"Kiri Coffee and Food"},create:{key:"business_name",value:"Kiri Coffee and Food"}});
}
main().finally(()=>prisma.$disconnect());
