export type MessDayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'

export type MessMealKey = 'breakfast' | 'lunch' | 'snacks' | 'dinner'
export type MessDayType = 'working' | 'holiday'

export interface MessMeal {
  name: string
  items: string[]
  specials: string[]
}

export interface MessDayMenu {
  breakfast: MessMeal
  lunch: MessMeal
  snacks: MessMeal
  dinner: MessMeal
}

export const SCHEDULE_EFFECTIVE_DATE = '2026-03-20'

export const MESS_SCHEDULE_NOTES: string[] = [
  'Menu may change based on supply and hostel administration updates.',
  'Special dishes are served subject to kitchen availability.',
  'Refer hostel notice board for urgent temporary menu changes.',
]

export const DAY_KEYS: MessDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export const DAY_SHORT_LABEL: Record<MessDayKey, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
}

export const DAY_LONG_LABEL: Record<MessDayKey, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

export const HOLIDAY_DAY_KEYS = new Set<MessDayKey>(['saturday', 'sunday'])

export const WORKING_DAY_MEAL_WINDOW_MINUTES: Record<MessMealKey, { start: number; end: number }> = {
  breakfast: { start: 420, end: 540 },
  lunch: { start: 690, end: 810 },
  snacks: { start: 990, end: 1050 },
  dinner: { start: 1170, end: 1260 },
}

export const HOLIDAY_MEAL_WINDOW_MINUTES: Record<MessMealKey, { start: number; end: number }> = {
  breakfast: { start: 450, end: 570 },
  lunch: { start: 720, end: 810 },
  snacks: { start: 990, end: 1050 },
  dinner: { start: 1170, end: 1260 },
}

// Backward-compatible default timing window.
export const MEAL_WINDOW_MINUTES: Record<MessMealKey, { start: number; end: number }> = {
  ...WORKING_DAY_MEAL_WINDOW_MINUTES,
}

export const MEAL_WINDOW_TEXT: Record<MessDayType, Record<MessMealKey, string>> = {
  working: {
    breakfast: '07.00 AM to 9.00 AM',
    lunch: '11.30 AM to 1.30 PM',
    snacks: '04.30 PM to 5.30 PM',
    dinner: '7.30 PM to 9.00 PM',
  },
  holiday: {
    breakfast: '07.30 AM to 9.30 AM',
    lunch: '12.00 Noon to 1.30 PM',
    snacks: '04.30 PM to 5.30 PM',
    dinner: '7.30 PM to 9.00 PM',
  },
}

export const MEAL_LABEL: Record<MessMealKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner',
}

export const NON_VEG_ITEMS = new Set<string>([
  'chicken masala',
  'egg curry',
  'fish fry',
  'chicken biryani',
  'boiled egg',
  'omelette',
])

export function normalizeMenuItemName(raw: string): string {
  const text = String(raw ?? '').trim().toLowerCase()
  if (!text) return ''

  if (text.includes('special fruit')) return 'Special Fruit'
  if (text.includes('ice cream')) return 'Ice Cream'

  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function meal(name: string, items: string[], specials: string[] = []): MessMeal {
  return {
    name,
    items: items.map(normalizeMenuItemName),
    specials: specials.map(normalizeMenuItemName),
  }
}

export const MESS_SCHEDULE: Record<MessDayKey, MessDayMenu> = {
  monday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Upma', 'Coconut Chutney', 'Poha', 'Mint Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Sweet', 'Variety Rice', 'White Rice', 'Dal Fry', 'Veg Subji', 'Pepper Rasam', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Pav Bhaji', 'Tea']),
    dinner: meal('Dinner', ['Butter Chappathi', 'Aloo Mutter Masala', 'White Rice', 'Dal Sambar', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruit']),
  },
  tuesday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Pongal', 'Sambar', 'Coconut Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Jeera Pulao', 'White Rice', 'Masala Sambar', 'Subji', 'Garlic Rasam', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Sundal', 'Tea']),
    dinner: meal('Dinner', ['Fried Rice', 'Veg Manchurian', 'White Rice', 'Tomato Dal', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruits']),
  },
  wednesday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Idly', 'Sambar', 'Kara Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Veg Pulao', 'White Rice', 'Dal Fry', 'Potato Poriyal', 'More Kuzhambu', 'Rasam', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Veg Puff', 'Tea']),
    dinner: meal('Dinner', ['Chappathi', 'Chicken Masala', 'Panneer Masala', 'Yellow Dal', 'White Rice', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruits']),
  },
  thursday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Semiya Kitchadi', 'Coconut Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Bagara Pulao', 'White Rice', 'Mysore Dal', 'Kara Kuzhambu', 'Rasam', 'Koottu', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Biscuit', 'Tea']),
    dinner: meal('Dinner', ['Malabar Paratha', 'Chenna Masala', 'White Rice', 'Tomato Dal', 'Poriyal', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruit', 'Ice Cream']),
  },
  friday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Pongal', 'Sambar', 'Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Sweet', 'Veg Biryani', 'Onion Raitha', 'Curd Rice', 'White Rice', 'Rasam', 'Potato Chips', 'Pickle']),
    snacks: meal('Snacks', ['Sweet Bun', 'Tea']),
    dinner: meal('Dinner', ['Ghee Chappathi', 'Mutter Panneer Masala', 'White Rice', 'Veg Dal', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruit']),
  },
  saturday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Semiya Kitchadi', 'Chutney', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Corn Pulao', 'White Rice', 'Dal Tadka', 'Karakuzhambu', 'Koottu', 'Rasam', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Tea', 'Cake']),
    dinner: meal('Dinner', ['Punjabi Paratha', 'Rajma Panneer Masala', 'White Rice', 'Veg Dal', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruit']),
  },
  sunday: {
    breakfast: meal('Breakfast', ['Bread', 'Butter', 'Jam', 'Idly', 'Chutney', 'Sambar', 'Boiled Egg', 'Banana', 'Milk', 'Coffee']),
    lunch: meal('Lunch', ['Chappathi', 'Chicken Masala', 'Panner Butter Masala', 'White Rice', 'Dal', 'Tomato Rasam', 'Butter Milk', 'Fryums', 'Pickle']),
    snacks: meal('Snacks', ['Sweet Corn', 'Tea', 'Juice']),
    dinner: meal('Dinner', ['Ghee Chappathi', 'Veg Chettinad Khurma', 'Dal Tadka', 'White Rice', 'Rasam', 'Fryums', 'Pickle', 'Veg Salad', 'Milk'], ['Special Fruit', 'Ice Cream']),
  },
}

export function getDayKeyFromDate(date: Date = new Date()): MessDayKey {
  const index = date.getDay()
  return DAY_KEYS[index] ?? 'sunday'
}

export function getMinutesOfDay(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function getMealWindows(dayType: MessDayType = 'working'): Record<MessMealKey, { start: number; end: number }> {
  return dayType === 'holiday' ? HOLIDAY_MEAL_WINDOW_MINUTES : WORKING_DAY_MEAL_WINDOW_MINUTES
}

export function getDayTypeFromDate(date: Date = new Date()): MessDayType {
  const dayKey = getDayKeyFromDate(date)
  if (dayKey === 'saturday' || dayKey === 'sunday') return 'holiday'
  return HOLIDAY_DAY_KEYS.has(dayKey) ? 'holiday' : 'working'
}

export function getActiveMeal(
  minutesOfDay: number = getMinutesOfDay(),
  dayType?: MessDayType,
  date: Date = new Date(),
): MessMealKey | null {
  const resolvedDayType = dayType ?? getDayTypeFromDate(date)
  const windows = getMealWindows(resolvedDayType)
  const mealKeys: MessMealKey[] = ['breakfast', 'lunch', 'snacks', 'dinner']
  for (const key of mealKeys) {
    const window = windows[key]
    if (!window) continue
    if (minutesOfDay >= window.start && minutesOfDay <= window.end) {
      return key
    }
  }
  return null
}

export function isNonVegItem(itemName: string): boolean {
  return NON_VEG_ITEMS.has(String(itemName ?? '').trim().toLowerCase())
}

export function getMenuForDay(day: MessDayKey): MessDayMenu {
  return MESS_SCHEDULE[day]
}

export function getMealMenu(day: MessDayKey, mealKey: MessMealKey): MessMeal {
  return MESS_SCHEDULE[day][mealKey]
}

export type MessSearchHit = {
  item: string
  day: MessDayKey
  meal: MessMealKey
  special: boolean
}

export function buildMessSearchIndex(): Map<string, MessSearchHit[]> {
  const index = new Map<string, MessSearchHit[]>()

  DAY_KEYS.forEach((day) => {
    const dayMenu = MESS_SCHEDULE[day]
    const mealKeys: MessMealKey[] = ['breakfast', 'lunch', 'snacks', 'dinner']

    mealKeys.forEach((mealKey) => {
      const mealData = dayMenu[mealKey]
      const pushHit = (item: string, special: boolean): void => {
        const key = String(item ?? '').trim().toLowerCase()
        if (!key) return
        const current = index.get(key) ?? []
        current.push({ item, day, meal: mealKey, special })
        index.set(key, current)
      }

      mealData.items.forEach((item) => pushHit(item, false))
      mealData.specials.forEach((item) => pushHit(item, true))
    })
  })

  return index
}

export const MESS_SEARCH_INDEX = buildMessSearchIndex()

export function daysSince(isoDate: string, fromDate: Date = new Date()): number {
  const start = new Date(isoDate)
  const diffMs = fromDate.getTime() - start.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}
