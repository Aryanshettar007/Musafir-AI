import { api } from './api';

export interface SponsorOutlet {
  label: string;
  googlePlaceId?: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export interface SponsorPartner {
  slug: string;
  name: string;
  active: boolean;
  category: string;
  imageUrl: string;
  brief: {
    tagline: string;
    highlights: string[];
    callToAction: string;
  };
  outlets: SponsorOutlet[];
  triggerRadiusM: number;
  maxDetourM: number;
}

// Fallback seeds if device is offline or network fails
const FALLBACK_SPONSORS: SponsorPartner[] = [
  {
    slug: 'corner-house',
    name: 'Corner House Ice Creams',
    active: true,
    category: 'Food & Pitstop',
    imageUrl: 'https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=800&q=80',
    brief: {
      tagline: 'A famous Bengaluru ice cream parlour',
      highlights: [
        'Started in Bengaluru in 1982',
        'Best known for the Death By Chocolate sundae',
        'Has an outlet in Mysuru',
      ],
      callToAction: 'Stop by for an ice cream in Mysuru',
    },
    outlets: [
      {
        label: 'Corner House, V.V. Mohalla, Mysuru',
        googlePlaceId: 'ChIJ0z9tQpt6rzsRlcsg-qSSrUs',
        address: 'Kalidasa Road, V.V. Mohalla, Mysuru',
        latitude: 12.32284,
        longitude: 76.63495,
      },
      {
        label: 'Corner House, Kuvempu Nagar, Mysuru',
        googlePlaceId: 'ChIJvUlbylJlrzsR13cTXA5MD_w',
        address: 'Vishwavamanava Double Road, Kuvempu Nagar, Mysuru',
        latitude: 12.28844,
        longitude: 76.6312,
      },
    ],
    triggerRadiusM: 600,
    maxDetourM: 3000,
  },
  {
    slug: 'royal-enfield',
    name: 'Royal Enfield Motoverse',
    active: true,
    category: 'Motorcycle & Adventure',
    imageUrl: 'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80',
    brief: {
      tagline: 'Pure motorcycling through scenic Karnataka passes',
      highlights: [
        'Official partner for highway journeys and coastal passes',
        'Dedicated pitstop lounges, espresso bar, and quick diagnostics',
      ],
      callToAction: 'Experience the highway lounge on Mysore Road',
    },
    outlets: [
      {
        label: 'Royal Enfield Pitstop Lounge, Ramanagara',
        googlePlaceId: 'ChIJ_zUReQJtrzsR7Hl9JmK1',
        address: 'Bangalore-Mysore Expressway, Ramanagara',
        latitude: 12.7214,
        longitude: 77.2789,
      },
      {
        label: 'Royal Enfield Garage Cafe, Indiranagar',
        googlePlaceId: 'ChIJb8u9784TrzsR_d6Vv1bF',
        address: '100ft Road, Indiranagar, Bengaluru',
        latitude: 12.9716,
        longitude: 77.6412,
      },
    ],
    triggerRadiusM: 800,
    maxDetourM: 2500,
  },
  {
    slug: 'karnataka-tourism',
    name: 'Karnataka Tourism (KSTDC)',
    active: true,
    category: 'Official Tourism Partner',
    imageUrl: 'https://images.unsplash.com/photo-1596401057633-54a8fe8ef647?auto=format&fit=crop&w=800&q=80',
    brief: {
      tagline: 'One State. Many Worlds. Official Heritage Trails',
      highlights: [
        'Official tourism board partner for cultural & architectural expeditions',
        'Curated historical audio stories across Srirangapatna and Mysuru',
      ],
      callToAction: 'Discover heritage waypoints along your drive',
    },
    outlets: [
      {
        label: 'KSTDC Heritage Centre, Srirangapatna',
        googlePlaceId: 'ChIJb_k4L_9xrzsRLPqPj9M7',
        address: 'Bangalore-Mysore Highway, Srirangapatna',
        latitude: 12.4238,
        longitude: 76.6934,
      },
      {
        label: 'Mysuru Palace Cultural Welcome Center',
        googlePlaceId: 'ChIJO7N3Pfp6rzsR5nZ6g2cW',
        address: 'Sayyaji Rao Rd, Chamrajpura, Mysuru',
        latitude: 12.3051,
        longitude: 76.6552,
      },
    ],
    triggerRadiusM: 1000,
    maxDetourM: 2000,
  },
];

export async function fetchSponsors(): Promise<SponsorPartner[]> {
  try {
    const res = await api.get<{ success: boolean; data: SponsorPartner[] }>('/sponsors');
    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
    return FALLBACK_SPONSORS;
  } catch (error) {
    console.warn('[sponsor-service] Falling back to local sponsor seeds:', error);
    return FALLBACK_SPONSORS;
  }
}
