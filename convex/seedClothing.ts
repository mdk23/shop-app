import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ensureDefaultSettings } from "./settings";
import { slugify } from "./productVariants";

const CATEGORIES = [
  "T-Shirts",
  "Shirts",
  "Trousers",
  "Jeans",
  "Dresses",
  "Skirts",
  "Jackets",
  "Shoes",
  "Bags",
  "Accessories",
  "Belts",
];

// Canonical size taxonomy, in display order (clothing sizes first, then numeric).
const SIZES = ["XS", "S", "M", "L", "XL", "28", "30", "32", "34", "36", "39", "40", "41", "42", "43"];

const COLORS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Navy", hex: "#1B2A4A" },
  { name: "Sand", hex: "#D8C6A1" },
  { name: "Sky Blue", hex: "#8FC1E3" },
  { name: "Beige", hex: "#E3D3B6" },
  { name: "Olive", hex: "#6B6E3A" },
  { name: "Khaki", hex: "#C3B091" },
  { name: "Charcoal", hex: "#3A3B3C" },
  { name: "Indigo", hex: "#3B4E8A" },
  { name: "Stonewash", hex: "#7C93A8" },
  { name: "Dark Wash", hex: "#2B3A55" },
  { name: "Grey", hex: "#9A9A9A" },
  { name: "Floral", hex: "#D98CA5" },
  { name: "Terracotta", hex: "#C1613F" },
  { name: "Camel", hex: "#C19A6B" },
  { name: "Washed Blue", hex: "#6C90B8" },
  { name: "Forest", hex: "#2E4A34" },
  { name: "Brown", hex: "#5A3A22" },
  { name: "Tan", hex: "#D2B48C" },
  { name: "Mustard", hex: "#C9A227" },
];

type ProductSpec = {
  name: string;
  category: string;
  cost: number;
  price: number;
  sizes: string[];
  colors: string[];
  reorder: number;
  startQty: number;
};

const PRODUCTS: ProductSpec[] = [
  { name: "Basic Cotton T-Shirt", category: "T-Shirts", cost: 180, price: 450, sizes: ["S", "M", "L", "XL"], colors: ["Black", "White", "Navy"], reorder: 6, startQty: 20 },
  { name: "Graphic Print Tee", category: "T-Shirts", cost: 220, price: 590, sizes: ["S", "M", "L"], colors: ["White", "Sand"], reorder: 5, startQty: 14 },
  { name: "Oxford Button-Down Shirt", category: "Shirts", cost: 420, price: 990, sizes: ["S", "M", "L", "XL"], colors: ["White", "Sky Blue"], reorder: 4, startQty: 10 },
  { name: "Linen Casual Shirt", category: "Shirts", cost: 480, price: 1150, sizes: ["M", "L", "XL"], colors: ["Beige", "Olive"], reorder: 3, startQty: 8 },
  { name: "Slim Chino Trousers", category: "Trousers", cost: 560, price: 1290, sizes: ["30", "32", "34", "36"], colors: ["Khaki", "Navy", "Charcoal"], reorder: 4, startQty: 9 },
  { name: "Straight Fit Jeans", category: "Jeans", cost: 640, price: 1490, sizes: ["30", "32", "34", "36"], colors: ["Indigo", "Black", "Stonewash"], reorder: 4, startQty: 12 },
  { name: "Slim Stretch Jeans", category: "Jeans", cost: 680, price: 1590, sizes: ["28", "30", "32", "34"], colors: ["Dark Wash", "Grey"], reorder: 3, startQty: 8 },
  { name: "Summer Wrap Dress", category: "Dresses", cost: 720, price: 1790, sizes: ["XS", "S", "M", "L"], colors: ["Floral", "Terracotta"], reorder: 3, startQty: 7 },
  { name: "A-Line Midi Skirt", category: "Skirts", cost: 380, price: 950, sizes: ["XS", "S", "M", "L"], colors: ["Black", "Camel"], reorder: 3, startQty: 6 },
  { name: "Denim Trucker Jacket", category: "Jackets", cost: 980, price: 2290, sizes: ["S", "M", "L", "XL"], colors: ["Indigo", "Washed Blue"], reorder: 2, startQty: 5 },
  { name: "Quilted Bomber Jacket", category: "Jackets", cost: 1120, price: 2690, sizes: ["M", "L", "XL"], colors: ["Black", "Forest"], reorder: 2, startQty: 4 },
  { name: "Canvas Low-Top Sneakers", category: "Shoes", cost: 540, price: 1350, sizes: ["39", "40", "41", "42", "43"], colors: ["White", "Black"], reorder: 3, startQty: 8 },
  { name: "Leather Chelsea Boots", category: "Shoes", cost: 1350, price: 3200, sizes: ["40", "41", "42", "43"], colors: ["Brown", "Black"], reorder: 2, startQty: 4 },
  { name: "Everyday Tote Bag", category: "Bags", cost: 420, price: 1090, sizes: [], colors: ["Tan", "Black", "Olive"], reorder: 3, startQty: 10 },
  { name: "Leather Belt", category: "Belts", cost: 210, price: 620, sizes: ["S", "M", "L"], colors: ["Brown", "Black"], reorder: 4, startQty: 15 },
  { name: "Knit Beanie", category: "Accessories", cost: 90, price: 320, sizes: [], colors: ["Grey", "Black", "Mustard"], reorder: 5, startQty: 18 },
];

export const seed = mutation({
  args: { wipe: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<string> => {
    // Acting user for ledger movements.
    const admin =
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first()) ??
      (await ctx.db.query("users").first());
    if (!admin) {
      throw new Error(
        "Create an admin user first (visit /setup) before seeding sample data."
      );
    }

    // Default branch + walk-in customer + settings.
    let branch =
      (await ctx.db
        .query("branches")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first()) ?? (await ctx.db.query("branches").first());
    if (!branch) {
      const id = await ctx.db.insert("branches", {
        name: "Main Store",
        code: "MAIN",
        address: "Headquarters",
        status: "active",
        isDefault: true,
        createdAt: Date.now(),
      });
      branch = await ctx.db.get(id);
    }
    const branchId = branch!._id;

    const generic = await ctx.db
      .query("customers")
      .withIndex("by_isGeneric", (q) => q.eq("isGeneric", true))
      .first();
    if (!generic) {
      await ctx.db.insert("customers", {
        name: "Walk-in Customer",
        phone1: "000000000",
        isGeneric: true,
        active: true,
        status: "active",
      });
    }
    await ensureDefaultSettings(ctx);

    if (args.wipe) {
      for (const table of [
        "productImages",
        "productVariants",
        "products",
        "categories",
      ] as const) {
        for (const row of await ctx.db.query(table).collect()) {
          await ctx.db.delete(row._id);
        }
      }
    }

    // Categories.
    const categoryId = new Map<string, Id<"categories">>();
    let order = 0;
    for (const name of CATEGORIES) {
      const existing = (await ctx.db.query("categories").collect()).find(
        (c) => c.name === name
      );
      if (existing) {
        categoryId.set(name, existing._id);
      } else {
        categoryId.set(
          name,
          await ctx.db.insert("categories", {
            name,
            active: true,
            sortOrder: order,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
      }
      order += 1;
    }

    // Size taxonomy.
    const existingSizes = await ctx.db.query("sizes").collect();
    for (let i = 0; i < SIZES.length; i++) {
      if (!existingSizes.some((s) => s.name === SIZES[i])) {
        await ctx.db.insert("sizes", {
          name: SIZES[i],
          sortOrder: i,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // Color taxonomy.
    const existingColors = await ctx.db.query("colors").collect();
    for (let i = 0; i < COLORS.length; i++) {
      if (!existingColors.some((c) => c.name === COLORS[i].name)) {
        await ctx.db.insert("colors", {
          name: COLORS[i].name,
          hex: COLORS[i].hex,
          sortOrder: i,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    // Products + variants + initial stock.
    let productCount = 0;
    let variantCount = 0;
    for (const spec of PRODUCTS) {
      const productId = await ctx.db.insert("products", {
        name: spec.name,
        categoryId: categoryId.get(spec.category)!,
        defaultCostPrice: spec.cost,
        defaultSellingPrice: spec.price,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      productCount += 1;

      const sizes = spec.sizes.length ? spec.sizes : [""];
      const colors = spec.colors.length ? spec.colors : [""];
      for (const color of colors) {
        for (const size of sizes) {
          const sku = [slugify(spec.name), slugify(color).replace(/-/g, "").slice(0, 6), slugify(size).replace(/-/g, "").slice(0, 4)]
            .filter(Boolean)
            .join("-");
          const variantId = await ctx.db.insert("productVariants", {
            productId,
            sku: `${sku}-${variantCount}`,
            size: size || undefined,
            color: color || undefined,
            costPrice: spec.cost,
            sellingPrice: spec.price,
            reorderLevel: spec.reorder,
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          variantCount += 1;
          await ctx.runMutation(internal.inventory.mutateStock, {
            productVariantId: variantId,
            branchId,
            quantity: spec.startQty,
            movementType: "INITIAL_STOCK",
            referenceType: "seed",
            notes: "Seed initial stock",
            userId: admin._id,
            username: admin.username,
          });
        }
      }
    }

    // Suppliers.
    const supplierNames = [
      "Metro Apparel Wholesale",
      "Coastline Textiles Ltd",
      "Atlas Denim Supply Co",
    ];
    const supplierIds: Id<"suppliers">[] = [];
    for (const name of supplierNames) {
      const existing = (await ctx.db.query("suppliers").collect()).find(
        (s) => s.name === name
      );
      supplierIds.push(
        existing?._id ??
          (await ctx.db.insert("suppliers", {
            name,
            status: "active",
            createdAt: Date.now(),
          }))
      );
    }

    return `Seeded ${productCount} products, ${variantCount} variants across ${CATEGORIES.length} categories, with ${SIZES.length} sizes and ${COLORS.length} colors configured, and initial stock at "${branch!.name}".`;
  },
});
