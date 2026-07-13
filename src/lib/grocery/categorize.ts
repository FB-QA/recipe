export const CATEGORY_ORDER = [
  "Produce",
  "Meat & Fish",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Other",
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];

// Checked in order — more specific categories first (so "chicken stock" reads as
// meat, "frozen peas" as frozen). Heuristic and deliberately simple for V1.
const RULES: Array<[Category, string[]]> = [
  ["Frozen", ["frozen", "ice cream", "ice-cream"]],
  [
    "Meat & Fish",
    ["chicken", "beef", "pork", "lamb", "mince", "bacon", "sausage", "turkey", "steak",
     "fish", "salmon", "tuna", "prawn", "shrimp", "cod", "haddock", "ham", "chorizo"],
  ],
  [
    "Dairy & Eggs",
    ["milk", "cheese", "feta", "yoghurt", "yogurt", "butter", "cream", "egg",
     "mozzarella", "parmesan", "halloumi", "mascarpone", "creme fraiche"],
  ],
  [
    "Bakery",
    ["bread", "bun", "brioche", "bagel", "tortilla", "wrap", "pitta", "pita",
     "naan", "roll", "baguette", "croissant"],
  ],
  [
    "Produce",
    ["tomato", "cucumber", "onion", "pepper", "lettuce", "spinach", "garlic",
     "lemon", "lime", "carrot", "potato", "avocado", "apple", "banana", "berry",
     "strawberr", "raspberr", "blueberr", "herb", "basil", "coriander", "parsley",
     "mint", "mushroom", "courgette", "zucchini", "broccoli", "kale", "ginger",
     "chilli", "chili", "celery", "cabbage", "cauliflower", "aubergine", "leek",
     "spring onion", "rocket", "salad"],
  ],
  [
    "Pantry",
    ["flour", "sugar", "oil", "rice", "pasta", "noodle", "udon", "stock", "sauce",
     "tin", "canned", "bean", "lentil", "chickpea", "spice", "salt", "vinegar",
     "honey", "oats", "chia", "seed", "nut", "soy", "miso", "tahini", "paste",
     "syrup", "cocoa", "chocolate", "couscous", "quinoa", "passata", "yeast"],
  ],
];

export function categorize(text: string): Category {
  const t = text.toLowerCase();
  for (const [category, words] of RULES) {
    if (words.some((w) => t.includes(w))) return category;
  }
  return "Other";
}
