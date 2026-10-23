export interface AudioStoryPoint {
  id: string;
  title: string;
  duration: string;
  description: string;
}

export interface PackWaypoint {
  id: string;
  name: string;
  blurb: string;
  latitude: number;
  longitude: number;
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
  description: string;
  storiesList: AudioStoryPoint[];
  waypoints: PackWaypoint[];
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
    creatorName: 'Local Creator',
    creatorRole: 'Community Storyteller',
    imageUrl: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=800&q=80',
    storiesCount: 8,
    duration: '42m',
    category: 'Heritage',
    description: 'Wander through the historic Pete precincts and Tipu Sultan’s summer retreat with rich, localized oral histories.',
    storiesList: [
      { id: 's1', title: 'The Lost Pete Fort Bastion', duration: '5m', description: 'Hidden battle scars on 18th-century stone structures.' },
      { id: 's2', title: 'Doddapet Silk Merchant Alley', duration: '6m', description: 'The trading heart of Kempe Gowda’s original city design.' },
      { id: 's3', title: 'Tipu’s Wooden Palace Whispers', duration: '7m', description: 'Intricate teak carvings and secret courtyards.' },
      { id: 's4', title: 'Avenue Road Temple Bells', duration: '5m', description: 'Centuries-old shrines nestled in modern chaos.' },
    ],
    waypoints: [
      { id: 'pack_1_w1', name: 'K R Market', blurb: 'Where the old Pete trading quarter still hums.', latitude: 12.9637, longitude: 77.5772 },
      { id: 'pack_1_w2', name: 'Bengaluru Fort', blurb: 'Surviving gate and bastion of the 18th-century fort.', latitude: 12.9631, longitude: 77.5759 },
      { id: 'pack_1_w3', name: "Tipu Sultan's Summer Palace", blurb: 'Teak pillars and painted arches.', latitude: 12.9594, longitude: 77.5738 },
      { id: 'pack_1_w4', name: 'Bull Temple', blurb: 'A Kempe Gowda–era shrine in Basavanagudi.', latitude: 12.943, longitude: 77.5681 },
    ],
  },
  {
    id: 'pack_2',
    title: 'Secret Street Food Trail',
    creatorName: 'Local Creator',
    creatorRole: 'Community Storyteller',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80',
    storiesCount: 14,
    duration: '1h 10m',
    category: 'Food Trail',
    description: 'Taste your way through time with tales behind vintage filter coffee, ghee roast crispiness, and artisanal sweet stalls.',
    storiesList: [
      { id: 's5', title: 'The Century-Old Filter Kaapi Bean', duration: '4m', description: 'The alchemy of dark roast chicory and brass dabaras.' },
      { id: 's6', title: 'Golden Butter Masala Dosa Origins', duration: '6m', description: 'How red chutney secrets passed through 3 generations.' },
      { id: 's7', title: 'Thindi Beedi Night Aromas', duration: '8m', description: 'Hot jalebis, Congress bun-butter, and sizzling tavas.' },
    ],
    waypoints: [
      { id: 'pack_2_w1', name: 'Malleshwaram', blurb: 'Dosa and filter coffee institutions.', latitude: 13.0035, longitude: 77.57 },
      { id: 'pack_2_w2', name: 'Commercial Street', blurb: 'Sweet stalls and chaat lanes.', latitude: 12.9822, longitude: 77.6083 },
      { id: 'pack_2_w3', name: 'V V Puram Food Street', blurb: 'Thindi Beedi after dark.', latitude: 12.9507, longitude: 77.574 },
      { id: 'pack_2_w4', name: 'Basavanagudi', blurb: 'Century-old kaapi and benne dosa.', latitude: 12.9456, longitude: 77.5727 },
    ],
  },
  {
    id: 'pack_3',
    title: 'Western Ghats Monsoon Drive',
    creatorName: 'Local Creator',
    creatorRole: 'Community Storyteller',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    storiesCount: 6,
    duration: '28m',
    category: 'Road Trip',
    description: 'Mist-clad hairpin bends, roaring mountain streams, and the rich biodiversity of India’s emerald backbone.',
    storiesList: [
      { id: 's8', title: 'Hairpin 14: The Valley of Mist', duration: '5m', description: 'Where monsoon clouds hit the sheer cliff faces.' },
      { id: 's9', title: 'Coffee Planters & Iron Bridges', duration: '7m', description: 'Colonial bungalows hidden under dense canopy.' },
      { id: 's10', title: 'The Malabar Giant Squirrel Call', duration: '4m', description: 'Recognizing endemic sounds of rainforest canopies.' },
    ],
    waypoints: [
      { id: 'pack_3_w1', name: 'Sakleshpur', blurb: 'Coffee country and misty plantations.', latitude: 12.9419, longitude: 75.7849 },
      { id: 'pack_3_w2', name: 'Manjarabad Fort', blurb: 'Star-shaped fort with a valley view.', latitude: 12.9145, longitude: 75.7567 },
      { id: 'pack_3_w3', name: 'Mudigere', blurb: 'Gateway to the high Ghats.', latitude: 13.1333, longitude: 75.6333 },
      { id: 'pack_3_w4', name: 'Charmadi Ghat', blurb: 'Hairpin bends above the clouds.', latitude: 13.03, longitude: 75.44 },
    ],
  },
  {
    id: 'pack_4',
    title: 'Midnight Ghost Lore & Myths',
    creatorName: 'Local Creator',
    creatorRole: 'Community Storyteller',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    storiesCount: 5,
    duration: '35m',
    category: 'Mystery',
    description: 'Spine-tingling legends, abandoned colonial villas, and urban folklore whispered on quiet highway stretches.',
    storiesList: [
      { id: 's11', title: 'The Vanishing Hitchhiker of St. Marks', duration: '6m', description: 'A recurring apparition noted since the 1970s.' },
      { id: 's12', title: 'Victoria Hospital Echo Chamber', duration: '7m', description: 'Footsteps that fade down closed hospital verandas.' },
      { id: 's13', title: 'The Unfinished Villa of Terra Vera', duration: '8m', description: 'An eerie murder mystery frozen in time.' },
    ],
    waypoints: [
      { id: 'pack_4_w1', name: "St. Mark's Road", blurb: 'Home of the vanishing hitchhiker tale.', latitude: 12.9729, longitude: 77.5995 },
      { id: 'pack_4_w2', name: 'Cubbon Park', blurb: 'Colonial-era paths with long shadows.', latitude: 12.9763, longitude: 77.5929 },
      { id: 'pack_4_w3', name: 'Victoria Hospital', blurb: 'Echoing verandas and old wards.', latitude: 12.9626, longitude: 77.574 },
      { id: 'pack_4_w4', name: 'Bangalore Palace', blurb: 'Turrets, rumours and midnight lights.', latitude: 12.9988, longitude: 77.5921 },
    ],
  },
  {
    id: 'pack_5',
    title: 'Ancient Hoysala Temple Tales',
    creatorName: 'Local Creator',
    creatorRole: 'Community Storyteller',
    imageUrl: 'https://images.unsplash.com/photo-1609766857041-ed402ea8069a?auto=format&fit=crop&w=800&q=80',
    storiesCount: 11,
    duration: '50m',
    category: 'Architecture',
    description: 'Decipher soapstone carvings, star-shaped plinths, and dynastic engineering from the 12th century.',
    storiesList: [
      { id: 's14', title: 'Star-Shaped Foundations', duration: '6m', description: 'Earthquake-resistant geometries conceived 900 years ago.' },
      { id: 's15', title: 'The Celestial Dancers (Madanikas)', duration: '8m', description: 'Sculptures with hollow stone jewelry that rings when tapped.' },
      { id: 's16', title: 'The Sign of Sala and the Tiger', duration: '5m', description: 'How an empire’s royal emblem was etched in legend.' },
    ],
    waypoints: [
      { id: 'pack_5_w1', name: 'Somanathapura', blurb: "Keshava Temple's star-shaped plan.", latitude: 12.2736, longitude: 76.8826 },
      { id: 'pack_5_w2', name: 'Shravanabelagola', blurb: 'Hilltop Jain heritage nearby.', latitude: 12.859, longitude: 76.4846 },
      { id: 'pack_5_w3', name: 'Halebidu', blurb: "Hoysaleswara's carved soapstone walls.", latitude: 13.2126, longitude: 75.9955 },
      { id: 'pack_5_w4', name: 'Belur', blurb: 'Chennakeshava Temple and its celestial dancers.', latitude: 13.1651, longitude: 75.8655 },
    ],
  },
];

export const CREATOR_PACKS_INFO_TITLE = 'Creator Economy & Voice Localization';
export const CREATOR_PACKS_INFO_MESSAGE =
  'Why this is important: Local creators, historians, and guides can publish and share their unique stories and heritage walks with road-trippers.\n\n' +
  'Monetization: Musafir earns revenue through creator listing fees and story subscription revenue share.\n\n' +
  'Multilingual AI Voice: Musafir translates and narrates the story in the user\'s preferred language, while cloning and maintaining the creator\'s own authentic voice.\n\n' +
  '(Audio preview is currently locked pending creator voice licensing and publishing permissions.)';
