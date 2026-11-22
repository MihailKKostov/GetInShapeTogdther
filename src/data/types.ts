import type { Timestamp } from 'firebase/firestore';

export type Units = 'metric' | 'imperial';
export type Sex = 'male' | 'female';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Visibility = 'friends' | 'private';

/** Fields that can be toggled public/private on the profile. */
export interface Sharing {
  currentWeight: boolean;
  targetWeight: boolean;
  startWeight: boolean;
  weightChange: boolean;
  weightHistory: boolean;
  height: boolean;
  calorieGoal: boolean;
  diary: boolean;
  activities: boolean;
}

export const DEFAULT_SHARING: Sharing = {
  currentWeight: false,
  targetWeight: false,
  startWeight: false,
  weightChange: false,
  weightHistory: false,
  height: false,
  calorieGoal: false,
  diary: false,
  activities: true,
};

/** Denormalized values copied to the public profile only when the matching toggle is on. */
export interface SharedValues {
  currentWeightKg?: number;
  targetWeightKg?: number;
  startWeightKg?: number;
  weightChangeKg?: number;
  heightCm?: number;
  calorieGoal?: number;
}

export interface PublicStats {
  streak: number;
  bestStreak: number;
  daysOnTarget: number;
  lastClosedDay?: string;
  workouts: number;
  distanceM: number;
  activeSec: number;
}

export const EMPTY_STATS: PublicStats = {
  streak: 0,
  bestStreak: 0,
  daysOnTarget: 0,
  workouts: 0,
  distanceM: 0,
  activeSec: 0,
};

/** users/{uid} — readable by the owner and their friends. */
export interface UserProfile {
  uid: string;
  displayName: string;
  nickname: string;
  photoURL: string | null;
  avatarMode: 'photo' | 'generated';
  avatarSeed: string;
  status: string;
  sharing: Sharing;
  shared: SharedValues;
  stats: PublicStats;
  createdAt?: Timestamp;
  lastActiveAt?: Timestamp;
}

/** users/{uid}/private/settings — owner only. */
export interface PrivateSettings {
  email: string;
  units: Units;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  weeklyRateKg: number;
  /** Optional date (YYYY-MM-DD) the user would like to reach their target weight by. */
  targetDate?: string | null;
  startWeightKg: number;
  targetWeightKg: number;
  calorieGoal: number;
  calorieGoalAuto: boolean;
  macroPct: { protein: number; carbs: number; fat: number };
  fiberGoal: number;
  sodiumMaxMg: number;
  waterGoalMl: number;
  addExerciseCalories: boolean;
  /** "On target" band relative to the day's budget, in percent. */
  bandLowerPct: number;
  bandUpperPct: number;
  setupComplete: boolean;
  /** Log meals from the meal plan to the diary automatically once their meal time has passed. */
  autoLogPlannedMeals?: boolean;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  sodiumMg?: number;
}

export const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg',
];

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

/** A food definition: nutrients per `per` grams (or per one serving when `per` is 0). */
export interface Food {
  id: string;
  source: 'generic' | 'off' | 'custom' | 'quick' | 'recipe' | 'photo';
  name: string;
  brand?: string;
  /** nutrients for 100 g */
  per100: Nutrients;
  servingG?: number;
  servingLabel?: string;
  /** Only known per serving (e.g. imported recipes): per100 then holds one serving and servingG is 100. */
  perServing?: boolean;
  recipeUrl?: string;
}

/** users/{uid}/recipeImports/{id} — written by the app, completed by the importRecipe function. */
export interface RecipeImport {
  id: string;
  url: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
  recipe?: {
    name: string;
    servings: number | null;
    yieldLabel: string | null;
    image: string | null;
    url: string;
    ingredients: string[];
    nutrition: (Partial<Nutrients> & { servingSize?: string }) | null;
    // Added with the RecipeMan port (absent from results of the first function version):
    description?: string;
    directions?: string[];
    nutritionText?: string;
    prepTime?: string;
    cookTime?: string;
    totalTime?: string;
    source?: string;
    categories?: string[];
  };
}

export interface FoodEntry {
  id: string;
  meal: Meal;
  foodId: string;
  source: Food['source'];
  name: string;
  brand?: string;
  grams: number;
  /** set for per-serving foods (recipes): number of servings eaten */
  servings?: number;
  /** nutrients for the logged amount */
  n: Nutrients;
  addedAt: number;
}

/** users/{uid}/diary/{YYYY-MM-DD} */
export interface DiaryDay {
  date: string;
  entries: FoodEntry[];
  waterMl: number;
  exerciseKcal: number;
  closed: boolean;
  onTarget?: boolean;
  budget?: number;
  totals?: Nutrients;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export type ActivityType =
  | 'run' | 'ride' | 'walk' | 'hike' | 'swim' | 'row'
  | 'strength' | 'hiit' | 'yoga' | 'sport' | 'other';

export interface StrengthSet {
  name: string;
  sets: number;
  reps: number;
  weightKg: number;
}

/** users/{uid}/activities/{id} */
export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  startedAt: Timestamp;
  date: string;
  durationSec: number;
  distanceM: number;
  elevationM: number;
  kcal: number;
  notes: string;
  /** flat [lat, lng, lat, lng, ...] */
  route: number[];
  exercises: StrengthSet[];
  visibility: Visibility;
  postId?: string;
  createdAt?: Timestamp;
}

export interface PostPhoto {
  url: string;
  path: string;
  w: number;
  h: number;
}

export type PostKind = 'status' | 'photo' | 'activity' | 'day' | 'recipe';

/** posts/{id} */
export interface Post {
  id: string;
  authorId: string;
  kind: PostKind;
  visibility: Visibility;
  createdAt: Timestamp | null;
  text: string;
  photos: PostPhoto[];
  progress: boolean;
  /** weight attached to a progress photo — only set if the author shares weight */
  weightKg?: number;
  activity?: {
    id: string;
    type: ActivityType;
    title: string;
    durationSec: number;
    distanceM: number;
    elevationM: number;
    kcal: number;
    route: number[];
    exercises: StrengthSet[];
  };
  /** Snapshot of a shared recipe (kind 'recipe'). */
  recipe?: RecipeSnapshot;
  day?: {
    date: string;
    kcal: number;
    budget: number;
    onTarget: boolean;
    streak: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
}

/** posts/{id}/reactions/{uid} */
export interface ReactionDoc {
  uid: string;
  emojis: string[];
}

/** emojis/{name} */
export interface CustomEmoji {
  name: string;
  url: string;
  path: string;
  createdBy: string;
  createdAt?: Timestamp;
}

/** invites/{code} */
export interface Invite {
  id: string;
  createdBy: string;
  inviterName: string;
  inviterPhoto: string | null;
  inviterSeed: string;
  createdAt?: Timestamp;
  expiresAt: Timestamp;
}

/** users/{uid}/friends/{friendUid} */
export interface FriendLink {
  uid: string;
  inviteId: string;
  since?: Timestamp;
}

// ───────────────────────── recipes (ported from RecipeMan)

export interface RecipePhoto {
  url: string;
  /** Storage path when the photo was uploaded by the owner (deleted with the recipe). */
  path?: string;
}

/** The parts of a recipe that are copied when it's shared or saved by a friend. */
export interface RecipeSnapshot {
  name: string;
  description: string;
  /** One ingredient per line. Lines ending with ':' or starting with '#' are section headers. */
  ingredients: string;
  /** One step per line. */
  directions: string;
  notes: string;
  /** Free-text nutrition as published with the recipe ("Calories: 350\nProtein: 20 g"). */
  nutrition: string;
  /** Structured nutrition for ONE serving, used to log the recipe to the diary. */
  perServing: Nutrients | null;
  perServingSource?: 'recipe' | 'manual' | 'ai' | null;
  servings: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  difficulty: string;
  source: string;
  sourceUrl: string;
  /** Main photo (uploaded or remote). */
  imageUrl: string;
  photos: RecipePhoto[];
  categories: string[];
}

/** users/{uid}/recipes/{id} */
export interface Recipe extends RecipeSnapshot {
  id: string;
  imagePath?: string;
  rating: number;
  favorite: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastCookedAt?: number | null;
  /** Set when saved from a friend's shared recipe. */
  sharedFrom?: { uid: string; name: string; postId: string } | null;
}

/** users/{uid}/groceryLists/{id} */
export interface GroceryList { id: string; name: string; createdAt?: Timestamp }

/** users/{uid}/groceryItems/{id} */
export interface GroceryItem {
  id: string;
  listId: string;
  /** Full display text, e.g. "2 cups flour". */
  name: string;
  aisle: string;
  recipeName: string;
  checked: boolean;
  createdAt: number;
}

/** users/{uid}/mealPlan/{id} */
export interface PlannedMeal {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  meal: Meal;
  recipeId: string | null;
  /** Free-text note, or the recipe's name (cached). */
  name: string;
  /** Servings eaten (for logging to the diary). */
  servings: number;
  /** Set once the meal has been logged to the diary. */
  loggedEntryId?: string | null;
}

/** users/{uid}/pantry/{id} */
export interface PantryItem {
  id: string;
  name: string;
  quantity: string;
  aisle: string;
  /** YYYY-MM-DD */
  purchaseDate: string | null;
  expirationDate: string | null;
  inStock: boolean;
}

export interface MenuItem { day: number; meal: Meal; recipeId: string | null; name: string }

/** users/{uid}/menus/{id} */
export interface RecipeMenu { id: string; name: string; notes: string; days: number; items: MenuItem[] }
