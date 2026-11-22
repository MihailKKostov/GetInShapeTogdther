// Guesses a supermarket aisle for an ingredient so grocery lists can be grouped.
// Ported from RecipeMan (parse/Aisles.kt).

export const OTHER_AISLE = 'Other';

export const AISLES = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Baking', 'Spices & Seasonings',
  'Pasta, Rice & Grains', 'Canned & Jarred', 'Condiments & Sauces', 'Oils & Vinegars',
  'Frozen', 'Snacks', 'Beverages', 'Household', OTHER_AISLE,
];

const KEYWORDS: Record<string, string[]> = {
  Produce: [
    'apple', 'banana', 'lemon', 'lime', 'orange', 'onion', 'shallot', 'garlic', 'ginger', 'potato', 'tomato',
    'carrot', 'celery', 'lettuce', 'spinach', 'kale', 'cabbage', 'broccoli', 'cauliflower', 'zucchini', 'squash',
    'pepper', 'bell pepper', 'jalapeno', 'jalapeño', 'chili', 'cucumber', 'avocado', 'mushroom', 'basil', 'parsley',
    'cilantro', 'mint', 'thyme', 'rosemary', 'dill', 'chive', 'scallion', 'green onion', 'leek', 'berries',
    'strawberr', 'blueberr', 'raspberr', 'grape', 'peach', 'pear', 'plum', 'mango', 'pineapple', 'cherry',
    'corn', 'pea', 'green bean', 'asparagus', 'eggplant', 'radish', 'beet', 'sweet potato', 'arugula', 'herbs',
    'fennel', 'melon', 'watermelon', 'kiwi', 'sage', 'oregano leaves', 'bok choy', 'sprouts', 'salad',
  ],
  'Meat & Seafood': [
    'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'ground beef', 'mince',
    'salmon', 'tuna steak', 'shrimp', 'prawn', 'cod', 'fish', 'tilapia', 'crab', 'lobster', 'scallop', 'mussel',
    'clam', 'veal', 'duck', 'chorizo', 'prosciutto', 'pancetta', 'salami', 'brisket', 'ribs', 'thigh', 'breast',
  ],
  'Dairy & Eggs': [
    'milk', 'butter', 'cream', 'cheese', 'yogurt', 'yoghurt', 'egg', 'sour cream', 'parmesan', 'mozzarella',
    'cheddar', 'ricotta', 'feta', 'buttermilk', 'half-and-half', 'half and half', 'creme fraiche', 'crème fraîche',
    'mascarpone', 'ghee', 'cream cheese', 'heavy cream', 'whipping cream',
  ],
  Bakery: ['bread', 'baguette', 'bun', 'roll', 'tortilla', 'pita', 'naan', 'croissant', 'bagel', 'breadcrumb', 'panko'],
  Baking: [
    'flour', 'sugar', 'brown sugar', 'powdered sugar', 'baking powder', 'baking soda', 'yeast', 'vanilla',
    'cocoa', 'chocolate chip', 'chocolate', 'cornstarch', 'corn starch', 'molasses', 'honey', 'maple syrup',
    'sprinkles', 'gelatin', 'almond extract', 'extract', 'shortening', 'corn syrup', 'condensed milk', 'evaporated milk',
    'oats', 'rolled oats',
  ],
  'Spices & Seasonings': [
    'salt', 'black pepper', 'peppercorn', 'cumin', 'paprika', 'cinnamon', 'nutmeg', 'oregano', 'chili powder',
    'cayenne', 'turmeric', 'curry powder', 'garlic powder', 'onion powder', 'bay leaf', 'bay leaves', 'clove',
    'cardamom', 'coriander', 'allspice', 'red pepper flakes', 'italian seasoning', 'seasoning', 'spice',
    'dried thyme', 'dried basil', 'garam masala', 'smoked paprika', 'five spice', 'sesame seeds',
  ],
  'Pasta, Rice & Grains': [
    'pasta', 'spaghetti', 'penne', 'macaroni', 'noodle', 'rice', 'quinoa', 'couscous', 'lasagna', 'fettuccine',
    'linguine', 'orzo', 'barley', 'farro', 'bulgur', 'polenta', 'cornmeal', 'ramen', 'udon',
  ],
  'Canned & Jarred': [
    'broth', 'stock', 'chicken broth', 'chicken stock', 'beef broth', 'beef stock', 'vegetable broth', 'vegetable stock',
    'canned', 'tomato paste', 'tomato sauce', 'diced tomatoes', 'crushed tomatoes', 'beans',
    'chickpea', 'lentil', 'coconut milk', 'olives', 'capers', 'pickles', 'tuna', 'artichoke', 'salsa', 'bouillon',
  ],
  'Condiments & Sauces': [
    'ketchup', 'mustard', 'mayonnaise', 'mayo', 'soy sauce', 'hot sauce', 'sriracha', 'worcestershire',
    'bbq sauce', 'barbecue sauce', 'fish sauce', 'oyster sauce', 'hoisin', 'jam', 'jelly', 'peanut butter',
    'tahini', 'pesto', 'dressing', 'relish', 'miso', 'tamari', 'teriyaki', 'gochujang', 'harissa', 'nutella',
  ],
  'Oils & Vinegars': ['olive oil', 'vegetable oil', 'canola oil', 'sesame oil', 'coconut oil', 'oil', 'vinegar', 'cooking spray'],
  Frozen: ['frozen', 'ice cream', 'ice'],
  Snacks: ['chips', 'crackers', 'pretzel', 'popcorn', 'nuts', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'pistachio', 'raisin', 'dried fruit', 'granola'],
  Beverages: ['wine', 'beer', 'juice', 'soda', 'coffee', 'tea', 'sparkling water', 'club soda', 'rum', 'vodka', 'whiskey', 'bourbon', 'tonic', 'liqueur'],
  Household: ['paper towel', 'foil', 'plastic wrap', 'parchment', 'toilet paper', 'detergent', 'soap', 'trash bag', 'sponge'],
};

const FLAT: [string, string][] = Object.entries(KEYWORDS)
  .flatMap(([aisle, words]) => words.map((w) => [w, aisle] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

export function guessAisle(item: string): string {
  const text = ` ${item.toLowerCase().replace(/[^a-zà-ÿ ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [word, aisle] of FLAT) {
    const idx = text.indexOf(` ${word}`);
    if (idx < 0) continue;
    const after = text[idx + word.length + 1] ?? ' ';
    const rest = text.slice(idx + word.length + 1);
    if (after === ' ' || rest.startsWith('s ') || rest.startsWith('es ') || word.endsWith('berr')) return aisle;
  }
  return OTHER_AISLE;
}
