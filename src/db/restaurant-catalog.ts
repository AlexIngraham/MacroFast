import { restaurants } from "@/db/schema";
import { getDatabase } from "@/db/client";

export interface RestaurantCatalogEntry {
  name: string;
  slug: string;
  websiteUrl: string;
  displayOrder: number;
}

export const restaurantCatalog: RestaurantCatalogEntry[] = [
  { displayOrder: 1, name: "Chick-fil-A", slug: "chick-fil-a", websiteUrl: "https://www.chick-fil-a.com" },
  { displayOrder: 2, name: "Chipotle", slug: "chipotle", websiteUrl: "https://www.chipotle.com" },
  { displayOrder: 3, name: "CAVA", slug: "cava", websiteUrl: "https://cava.com" },
  { displayOrder: 4, name: "Jersey Mike's", slug: "jersey-mikes", websiteUrl: "https://www.jerseymikes.com" },
  { displayOrder: 5, name: "Shake Shack", slug: "shake-shack", websiteUrl: "https://shakeshack.com" },
  { displayOrder: 6, name: "Panda Express", slug: "panda-express", websiteUrl: "https://www.pandaexpress.com" },
  { displayOrder: 7, name: "Sweetgreen", slug: "sweetgreen", websiteUrl: "https://www.sweetgreen.com" },
  { displayOrder: 8, name: "Subway", slug: "subway", websiteUrl: "https://www.subway.com" },
  { displayOrder: 9, name: "QDOBA", slug: "qdoba", websiteUrl: "https://www.qdoba.com" },
  { displayOrder: 10, name: "Moe's Southwest Grill", slug: "moes-southwest-grill", websiteUrl: "https://www.moes.com" },
  { displayOrder: 11, name: "Taco Bell", slug: "taco-bell", websiteUrl: "https://www.tacobell.com" },
  { displayOrder: 12, name: "Wendy's", slug: "wendys", websiteUrl: "https://www.wendys.com" },
  { displayOrder: 13, name: "McDonald's", slug: "mcdonalds", websiteUrl: "https://www.mcdonalds.com" },
  { displayOrder: 14, name: "Burger King", slug: "burger-king", websiteUrl: "https://www.bk.com" },
  { displayOrder: 15, name: "Popeyes", slug: "popeyes", websiteUrl: "https://www.popeyes.com" },
  { displayOrder: 16, name: "KFC", slug: "kfc", websiteUrl: "https://www.kfc.com" },
  { displayOrder: 17, name: "Raising Cane's", slug: "raising-canes", websiteUrl: "https://www.raisingcanes.com" },
  { displayOrder: 18, name: "Wingstop", slug: "wingstop", websiteUrl: "https://www.wingstop.com" },
  { displayOrder: 19, name: "Buffalo Wild Wings", slug: "buffalo-wild-wings", websiteUrl: "https://www.buffalowildwings.com" },
  { displayOrder: 20, name: "Five Guys", slug: "five-guys", websiteUrl: "https://www.fiveguys.com" },
  { displayOrder: 21, name: "In-N-Out", slug: "in-n-out", websiteUrl: "https://www.in-n-out.com" },
  { displayOrder: 22, name: "Whataburger", slug: "whataburger", websiteUrl: "https://whataburger.com" },
  { displayOrder: 23, name: "Culver's", slug: "culvers", websiteUrl: "https://www.culvers.com" },
  { displayOrder: 24, name: "Sonic", slug: "sonic", websiteUrl: "https://www.sonicdrivein.com" },
  { displayOrder: 25, name: "Jack in the Box", slug: "jack-in-the-box", websiteUrl: "https://www.jackinthebox.com" },
  { displayOrder: 26, name: "Carl's Jr. / Hardee's", slug: "carls-jr-hardees", websiteUrl: "https://www.ckr.com" },
  { displayOrder: 27, name: "Arby's", slug: "arbys", websiteUrl: "https://www.arbys.com" },
  { displayOrder: 28, name: "Panera Bread", slug: "panera-bread", websiteUrl: "https://www.panerabread.com" },
  { displayOrder: 29, name: "Nando's PERi-PERi", slug: "nandos-peri-peri", websiteUrl: "https://www.nandosperiperi.com" },
  { displayOrder: 30, name: "El Pollo Loco", slug: "el-pollo-loco", websiteUrl: "https://www.elpolloloco.com" },
  { displayOrder: 31, name: "Pollo Tropical", slug: "pollo-tropical", websiteUrl: "https://www.pollotropical.com" },
  { displayOrder: 32, name: "Boston Market", slug: "boston-market", websiteUrl: "https://www.bostonmarket.com" },
  { displayOrder: 33, name: "Just Salad", slug: "just-salad", websiteUrl: "https://www.justsalad.com" },
  { displayOrder: 34, name: "Chopt", slug: "chopt", websiteUrl: "https://www.choptsalad.com" },
  { displayOrder: 35, name: "Freshii", slug: "freshii", websiteUrl: "https://freshii.com" },
  { displayOrder: 36, name: "Pokeworks", slug: "pokeworks", websiteUrl: "https://www.pokeworks.com" },
  { displayOrder: 37, name: "Poke Bros.", slug: "poke-bros", websiteUrl: "https://pokebros.com" },
  { displayOrder: 38, name: "Teriyaki Madness", slug: "teriyaki-madness", websiteUrl: "https://teriyakimadness.com" },
  { displayOrder: 39, name: "WaBa Grill", slug: "waba-grill", websiteUrl: "https://www.wabagrill.com" },
  { displayOrder: 40, name: "Flame Broiler", slug: "flame-broiler", websiteUrl: "https://flamebroilerusa.com" },
];

export async function syncRestaurantCatalog(): Promise<number> {
  const db = getDatabase();
  for (const restaurant of restaurantCatalog) {
    await db
      .insert(restaurants)
      .values(restaurant)
      .onConflictDoUpdate({
        target: restaurants.slug,
        set: {
          name: restaurant.name,
          websiteUrl: restaurant.websiteUrl,
          displayOrder: restaurant.displayOrder,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }
  return restaurantCatalog.length;
}
