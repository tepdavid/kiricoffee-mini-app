import { prisma } from "@/lib/db";
import CoffeeMenu from "./coffee-menu";

export default async function Home() {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: {
          variants: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  const menu = categories.map((category) => ({
    id: category.id,
    name: category.name,
    products: category.products.map((product) => ({
      id: product.id,
      name: product.name,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        price: Number(variant.price),
      })),
    })),
  }));

  return <CoffeeMenu categories={menu} />;
}
