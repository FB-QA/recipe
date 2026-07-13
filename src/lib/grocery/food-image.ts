// Maps an ingredient / grocery line to a coloured food cutout (Twemoji SVG,
// CC-BY 4.0, bundled in /public/food). Keyword-based, specific first. Returns
// null when nothing matches, so the caller can fall back to a line icon.
const MAP: Array<[string, string]> = [
  ["chicken", "chicken"], ["turkey", "chicken"], ["bacon", "bacon"], ["sausage", "sausage"],
  ["chorizo", "sausage"], ["beef", "meat"], ["steak", "meat"], ["lamb", "meat"], ["mince", "meat"],
  ["pork", "meat"], ["ham", "meat"], ["salmon", "fish"], ["tuna", "fish"], ["cod", "fish"],
  ["haddock", "fish"], ["fish", "fish"], ["prawn", "shrimp"], ["shrimp", "shrimp"],
  ["egg", "egg"], ["milk", "milk"], ["butter", "butter"], ["feta", "cheese"], ["mozzarella", "cheese"],
  ["parmesan", "cheese"], ["halloumi", "cheese"], ["cheese", "cheese"], ["yoghurt", "milk"],
  ["yogurt", "milk"], ["cream", "milk"],
  ["baguette", "baguette"], ["croissant", "croissant"], ["brioche", "bread"], ["bread", "bread"],
  ["bun", "bread"], ["roll", "bread"], ["bagel", "bread"],
  ["tomato", "tomato"], ["cucumber", "cucumber"], ["courgette", "cucumber"], ["zucchini", "cucumber"],
  ["onion", "onion"], ["garlic", "garlic"], ["chilli", "chilli"], ["chili", "chilli"],
  ["pepper", "bellpepper"], ["carrot", "carrot"], ["potato", "potato"], ["avocado", "avocado"],
  ["mushroom", "mushroom"], ["broccoli", "broccoli"], ["cauliflower", "broccoli"], ["corn", "corn"],
  ["aubergine", "eggplant"], ["eggplant", "eggplant"],
  ["lettuce", "leafygreen"], ["spinach", "leafygreen"], ["kale", "leafygreen"], ["cabbage", "leafygreen"],
  ["rocket", "leafygreen"], ["salad", "salad"],
  ["lemon", "lemon"], ["lime", "lemon"], ["apple", "apple"], ["banana", "banana"],
  ["strawberr", "strawberry"], ["raspberr", "strawberry"], ["blueberr", "blueberry"], ["grape", "grapes"],
  ["berry", "strawberry"],
  ["basil", "herb"], ["coriander", "herb"], ["parsley", "herb"], ["mint", "herb"], ["herb", "herb"],
  ["rice", "rice"], ["spaghetti", "spaghetti"], ["pasta", "spaghetti"], ["noodle", "noodle"],
  ["udon", "noodle"],
  ["peanut", "peanut"], ["nut", "peanut"], ["chickpea", "beans"], ["lentil", "beans"], ["bean", "beans"],
  ["honey", "honey"], ["salt", "salt"], ["chocolate", "chocolate"], ["cocoa", "chocolate"], ["oil", "oil"],
];

export function foodImage(text: string): string | null {
  const t = text.toLowerCase();
  for (const [keyword, file] of MAP) {
    if (t.includes(keyword)) return `/food/${file}.svg`;
  }
  return null;
}
