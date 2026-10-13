export interface AudioStoryPoint {
  id: string;
  title: string;
  duration: string;
  description: string;
}

export interface CreatorPack {
  id: string;
  title: string;
  creatorName: string;
  creatorAvatar?: string;
  creatorRole?: string;
  imageUrl: string;
  storiesCount: number;
  duration: string;
  category: string;
  rating: number;
  reviewsCount: number;
  description: string;
  storiesList: AudioStoryPoint[];
}

export const CREATOR_PACK_CATEGORIES = [
  'All',
  'Heritage',
  'Food Trail',
  'Road Trip',
  'Mystery',
  'Architecture',
] as const;

export const CREATOR_PACKS: CreatorPack[] = [
  {
    id: 'pack_1',
    title: 'Old Bengaluru Heritage Walk',
    creatorName: 'Aarav Sharma',
    creatorRole: 'Heritage Chronicler',
    imageUrl: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
    storiesCount: 8,
    duration: '42m',
    category: 'Heritage',
    rating: 4.9,
    reviewsCount: 142,
    description: 'Wander through the historic Pete precincts and Tipu Sultan’s summer retreat with rich, localized oral histories.',
    storiesList: [
      { id: 's1', title: 'The Lost Pete Fort Bastion', duration: '5m', description: 'Hidden battle scars on 18th-century stone structures.' },
      { id: 's2', title: 'Doddapet Silk Merchant Alley', duration: '6m', description: 'The trading heart of Kempe Gowda’s original city design.' },
      { id: 's3', title: 'Tipu’s Wooden Palace Whispers', duration: '7m', description: 'Intricate teak carvings and secret courtyards.' },
      { id: 's4', title: 'Avenue Road Temple Bells', duration: '5m', description: 'Centuries-old shrines nestled in modern chaos.' },
    ],
  },
  {
    id: 'pack_2',
    title: 'Secret Street Food Trail',
    creatorName: 'Chef Tanya Roy',
    creatorRole: 'Culinary Anthropologist',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
    storiesCount: 14,
    duration: '1h 10m',
    category: 'Food Trail',
    rating: 4.95,
    reviewsCount: 230,
    description: 'Taste your way through time with tales behind vintage filter coffee, ghee roast crispiness, and artisanal sweet stalls.',
    storiesList: [
      { id: 's5', title: 'The Century-Old Filter Kaapi Bean', duration: '4m', description: 'The alchemy of dark roast chicory and brass dabaras.' },
      { id: 's6', title: 'Golden Butter Masala Dosa Origins', duration: '6m', description: 'How red chutney secrets passed through 3 generations.' },
      { id: 's7', title: 'Thindi Beedi Night Aromas', duration: '8m', description: 'Hot jalebis, Congress bun-butter, and sizzling tavas.' },
    ],
  },
  {
    id: 'pack_3',
    title: 'Western Ghats Monsoon Drive',
    creatorName: 'Rohit Shenoy',
    creatorRole: 'Expedition Guide',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    storiesCount: 6,
    duration: '28m',
    category: 'Road Trip',
    rating: 4.88,
    reviewsCount: 98,
    description: 'Mist-clad hairpin bends, roaring mountain streams, and the rich biodiversity of India’s emerald backbone.',
    storiesList: [
      { id: 's8', title: 'Hairpin 14: The Valley of Mist', duration: '5m', description: 'Where monsoon clouds hit the sheer cliff faces.' },
      { id: 's9', title: 'Coffee Planters & Iron Bridges', duration: '7m', description: 'Colonial bungalows hidden under dense canopy.' },
      { id: 's10', title: 'The Malabar Giant Squirrel Call', duration: '4m', description: 'Recognizing endemic sounds of rainforest canopies.' },
    ],
  },
  {
    id: 'pack_4',
    title: 'Midnight Ghost Lore & Myths',
    creatorName: 'Urban Mythologist',
    creatorRole: 'Folklorist & Author',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    storiesCount: 5,
    duration: '35m',
    category: 'Mystery',
    rating: 4.82,
    reviewsCount: 165,
    description: 'Spine-tingling legends, abandoned colonial villas, and urban folklore whispered on quiet highway stretches.',
    storiesList: [
      { id: 's11', title: 'The Vanishing Hitchhiker of St. Marks', duration: '6m', description: 'A recurring apparition noted since the 1970s.' },
      { id: 's12', title: 'Victoria Hospital Echo Chamber', duration: '7m', description: 'Footsteps that fade down closed hospital verandas.' },
      { id: 's13', title: 'The Unfinished Villa of Terra Vera', duration: '8m', description: 'An eerie murder mystery frozen in time.' },
    ],
  },
  {
    id: 'pack_5',
    title: 'Ancient Hoysala Temple Tales',
    creatorName: 'Dr. K. Sastri',
    creatorRole: 'Archaeological Historian',
    imageUrl: 'https://images.unsplash.com/photo-1609766857041-ed402ea8069a?auto=format&fit=crop&w=800&q=80',
    storiesCount: 11,
    duration: '50m',
    category: 'Architecture',
    rating: 4.96,
    reviewsCount: 88,
    description: 'Decipher soapstone carvings, star-shaped plinths, and dynastic engineering from the 12th century.',
    storiesList: [
      { id: 's14', title: 'Star-Shaped Foundations', duration: '6m', description: 'Earthquake-resistant geometries conceived 900 years ago.' },
      { id: 's15', title: 'The Celestial Dancers (Madanikas)', duration: '8m', description: 'Sculptures with hollow stone jewelry that rings when tapped.' },
      { id: 's16', title: 'The Sign of Sala and the Tiger', duration: '5m', description: 'How an empire’s royal emblem was etched in legend.' },
    ],
  },
];
