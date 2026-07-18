/** System site templates using Phase 1–3 presence modules. */

const IMG = {
  coast: 'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=1400&q=80',
  pool: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80',
  hotel: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
  mountain: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
  beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
  temple: 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?auto=format&fit=crop&w=1200&q=80',
  road: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80',
  room: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80',
  suite: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
  lobby: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
  living: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  garden: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80',
  person1: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
  person2: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
};

export const SYSTEM_SITE_TEMPLATES = [
  {
    key: 'agency_marketing',
    name: 'Travel agency website',
    category: 'travel',
    description:
      'Full agency site for Horizon — destinations, packages, about, and enquiry using catalog modules only.',
    recommendedThemeKeysJson: ['horizon', 'coastline', 'altitude', 'atelier'],
    structureJson: {
      navigation: [
        { label: 'Home', path: '/' },
        { label: 'Destinations', path: '/destinations' },
        { label: 'Trips', path: '/trips' },
        { label: 'About', path: '/about' },
        { label: 'Contact', path: '/contact' },
      ],
      globalRegions: {
        header: { links: ['Home', 'Destinations', 'Trips', 'About', 'Contact'], ctaLabel: 'Plan a trip', ctaHref: '/contact' },
        footer: { note: 'Crafted journeys · Powered by Wayrune' },
      },
      pages: [
        {
          path: '/',
          title: 'Home',
          layoutKey: 'default',
          sections: [
            {
              type: 'offer_banner',
              propsJson: {
                eyebrow: 'Limited seats',
                title: 'Autumn departures filling fast',
                body: 'Enquire for early-bird rates while inventory lasts.',
                imageUrl: IMG.coast,
                ctaLabel: 'Enquire now',
                ctaHref: '/contact',
              },
            },
            {
              type: 'hero',
              propsJson: {
                eyebrow: 'Travel · Tailor-made',
                headline: 'Journeys shaped around you',
                subhead:
                  'From Himalayan trails to island escapes — local expertise, calm planning, memorable days.',
                ctaLabel: 'Plan my trip',
                ctaHref: '/contact',
                secondaryCtaLabel: 'Browse trips',
                secondaryCtaHref: '/trips',
                variant: 'immersive',
                imageUrl: IMG.coast,
              },
            },
            {
              type: 'trip_facts',
              propsJson: {
                eyebrow: 'Trusted by travellers',
                title: '',
                items: [
                  { value: '12+', label: 'Years planning' },
                  { value: '40+', label: 'Partner hotels' },
                  { value: '12', label: 'Regions' },
                  { value: '24h', label: 'Typical reply' },
                ],
              },
            },
            {
              type: 'inclusions',
              propsJson: {
                eyebrow: 'Why us',
                title: 'Everything you need for a smooth journey',
                body: 'Clear planning, local know-how, and support when it matters.',
                columns: '3',
                items: [
                  { icon: '✦', title: 'Local expertise', body: 'On-ground partners who know the places you will love.' },
                  { icon: '◈', title: 'Tailored plans', body: 'Itineraries shaped around your pace, budget, and style.' },
                  { icon: '◎', title: 'Calm support', body: 'A real team on call before and during your trip.' },
                ],
              },
            },
            {
              type: 'destination_grid',
              propsJson: {
                eyebrow: 'Go places',
                title: 'Destinations we love',
                items: [
                  { image: IMG.coast, name: 'Sri Lanka', tagline: 'Tea country to the south coast', href: '/destinations' },
                  { image: IMG.temple, name: 'Vietnam', tagline: 'Cities, islands, quiet countryside', href: '/destinations' },
                  { image: IMG.mountain, name: 'Himalaya', tagline: 'Trails, lodges, and long views', href: '/destinations' },
                ],
              },
            },
            {
              type: 'stats',
              propsJson: {
                eyebrow: 'By the numbers',
                items: [
                  { value: '12+', label: 'Years planning' },
                  { value: '400+', label: 'Trips crafted' },
                  { value: '98%', label: 'Would recommend' },
                  { value: '24h', label: 'Typical reply' },
                ],
              },
            },
            {
              type: 'testimonials',
              propsJson: {
                eyebrow: 'Traveller stories',
                title: 'Trips people still talk about',
                items: [
                  {
                    quote: 'Every transfer, stay, and tip felt considered — we never felt alone on the road.',
                    author: 'The Shahs · Rajasthan',
                  },
                  {
                    quote: 'They listened first, then built an itinerary that matched how we actually travel.',
                    author: 'Mira K. · Bali',
                  },
                ],
              },
            },
            {
              type: 'newsletter_form',
              propsJson: {
                eyebrow: 'Stay close',
                title: 'Travel notes in your inbox',
                body: 'Occasional ideas, never spam.',
                placeholder: 'you@email.com',
                buttonLabel: 'Subscribe',
                formKey: 'contact',
              },
            },
            {
              type: 'cta',
              propsJson: {
                eyebrow: 'Start here',
                title: 'Tell us where you want to go',
                body: 'Share dates, pace, and must-sees — we will reply with a thoughtful outline.',
                label: 'Request a plan',
                href: '/contact',
                variant: 'band',
              },
            },
          ],
        },
        {
          path: '/destinations',
          title: 'Destinations',
          layoutKey: 'default',
          sections: [
            {
              type: 'section_heading',
              propsJson: {
                eyebrow: 'Destinations',
                title: 'Places we know well',
                subhead: 'Regions we plan with care — ask us about seasons, pacing, and the quiet corners.',
              },
            },
            {
              type: 'destination_grid',
              propsJson: {
                eyebrow: 'Featured',
                title: 'Explore by place',
                items: [
                  { image: IMG.coast, name: 'Sri Lanka', tagline: 'Tea country to the south coast', href: '/contact' },
                  { image: IMG.temple, name: 'Vietnam', tagline: 'Cities, islands, quiet countryside', href: '/contact' },
                  { image: IMG.mountain, name: 'Himalaya', tagline: 'Trails, lodges, and long views', href: '/contact' },
                  { image: IMG.beach, name: 'Maldives', tagline: 'Still water and unhurried days', href: '/contact' },
                ],
              },
            },
            {
              type: 'gallery',
              propsJson: {
                eyebrow: 'Mood',
                title: 'Places & moments',
                images: [
                  { url: IMG.coast, alt: 'Coast' },
                  { url: IMG.pool, alt: 'Pool' },
                  { url: IMG.hotel, alt: 'Lobby' },
                  { url: IMG.lobby, alt: 'Room' },
                  { url: IMG.mountain, alt: 'Mountains' },
                  { url: IMG.road, alt: 'Road' },
                ],
              },
            },
            {
              type: 'itinerary_timeline',
              propsJson: {
                eyebrow: 'Sample circuit',
                title: 'A classic route',
                items: [
                  { day: 'Stop 1', title: 'Arrive — Capital', body: 'Night 1–2' },
                  { day: 'Stop 2', title: 'Hill country', body: 'Night 3–5' },
                  { day: 'Stop 3', title: 'South coast', body: 'Night 6–8' },
                ],
              },
            },
            {
              type: 'hero_search',
              propsJson: {
                title: 'Where to next?',
                body: 'Tell us a destination and rough dates — we will take it from there.',
                destinationLabel: 'Destination',
                datesLabel: 'Travel dates',
                ctaLabel: 'Start enquiry',
                ctaHref: '/contact',
              },
            },
          ],
        },
        {
          path: '/trips',
          title: 'Trips',
          layoutKey: 'default',
          sections: [
            {
              type: 'section_heading',
              propsJson: {
                eyebrow: 'Packages',
                title: 'Ready-to-tailor trips',
                subhead: 'Starting points we refine with you — dates, hotels, and pace included.',
              },
            },
            {
              type: 'offer_banner',
              propsJson: {
                eyebrow: 'This season',
                title: 'Monsoon rates are live',
                body: 'Lush landscapes, quieter hotels, and softer prices.',
                imageUrl: IMG.coast,
                ctaLabel: 'See offers',
                ctaHref: '/contact',
              },
            },
            {
              type: 'package_grid',
              propsJson: {
                eyebrow: 'Trips',
                title: 'Featured packages',
                items: [
                  {
                    image: IMG.coast,
                    name: 'Coastal week',
                    price: 'From $1,290',
                    nights: '7 nights',
                    highlights: 'Beach stay\nOne day tour\nAirport transfers',
                    ctaLabel: 'Enquire',
                    ctaHref: '/contact',
                  },
                  {
                    image: IMG.mountain,
                    name: 'Hill escape',
                    price: 'From $980',
                    nights: '5 nights',
                    highlights: 'Tea country lodge\nGuided walks\nTrain journey',
                    ctaLabel: 'Enquire',
                    ctaHref: '/contact',
                  },
                  {
                    image: IMG.temple,
                    name: 'Culture circuit',
                    price: 'From $1,650',
                    nights: '10 nights',
                    highlights: 'Private guide\nHeritage stays\nFlexible pacing',
                    ctaLabel: 'Enquire',
                    ctaHref: '/contact',
                  },
                ],
              },
            },
            {
              type: 'itinerary_timeline',
              propsJson: {
                eyebrow: 'Sample',
                title: 'Coastal week — day by day',
                items: [
                  { day: 'Day 1', title: 'Arrive & settle', body: 'Airport meet, check-in, and a gentle evening walk.' },
                  { day: 'Day 2', title: 'Coast road', body: 'Scenic drive with lunch by the water.' },
                  { day: 'Day 3', title: 'Free morning', body: 'Optional spa or market — your pace.' },
                ],
              },
            },
            {
              type: 'inclusions',
              propsJson: {
                eyebrow: 'Peace of mind',
                title: 'Travel with confidence',
                body: 'Clear support and trusted partners on every trip.',
                columns: '3',
                items: [
                  { icon: '✓', title: 'Licensed agency', body: 'Fully registered operators' },
                  { icon: '✓', title: 'Secure payments', body: 'Card & bank transfer' },
                  { icon: '✓', title: '24/7 line', body: 'On-trip support number' },
                ],
              },
            },
            {
              type: 'cta',
              propsJson: {
                title: 'Need something more bespoke?',
                body: 'Tell us your dates and we will shape a private itinerary.',
                label: 'Request a custom plan',
                href: '/contact',
                variant: 'band',
              },
            },
          ],
        },
        {
          path: '/about',
          title: 'About',
          layoutKey: 'default',
          sections: [
            {
              type: 'section_heading',
              propsJson: {
                eyebrow: 'About',
                title: 'Local knowledge, calm logistics',
                subhead: 'A small travel team obsessed with pacing, hospitality partners, and the details that make a trip feel effortless.',
              },
            },
            {
              type: 'split_content',
              propsJson: {
                eyebrow: 'Our story',
                title: 'We started by planning for friends',
                body: 'Today we still work the same way — listen first, then shape options that fit real life.',
                imageUrl: IMG.road,
                imageAlt: 'Travel overlook',
                ctaLabel: 'Talk to us',
                ctaHref: '/contact',
                imageSide: 'right',
              },
            },
            {
              type: 'itinerary_timeline',
              propsJson: {
                eyebrow: 'Process',
                title: 'How we work',
                items: [
                  { day: '1', title: 'Share your idea', body: 'Dates, budget, and the feeling you want from the trip.' },
                  { day: '2', title: 'We shape options', body: 'A shortlist with clear trade-offs — no fluff.' },
                  { day: '3', title: 'Travel with backup', body: 'We stay reachable while you are away.' },
                ],
              },
            },
            {
              type: 'team_profiles',
              propsJson: {
                eyebrow: 'People',
                title: 'Meet the team',
                body: 'The humans behind the journeys.',
                items: [
                  {
                    photo: IMG.person1,
                    name: 'Maya Chen',
                    role: 'Founder',
                    bio: 'Fifteen years crafting trips across Asia.',
                  },
                  {
                    photo: IMG.person2,
                    name: 'Leo Park',
                    role: 'Trip designer',
                    bio: 'Obsessed with quiet trails and good food.',
                  },
                ],
              },
            },
            {
              type: 'faq',
              propsJson: {
                eyebrow: 'Planning',
                title: 'Common questions',
                items: [
                  {
                    q: 'How far ahead should we enquire?',
                    a: 'Ideal is 6–12 weeks for popular seasons; last-minute is possible when inventory allows.',
                  },
                  {
                    q: 'Do you book flights?',
                    a: 'We can coordinate flights or work with tickets you already hold — tell us what you prefer.',
                  },
                ],
              },
            },
          ],
        },
        {
          path: '/contact',
          title: 'Contact',
          layoutKey: 'default',
          sections: [
            {
              type: 'section_heading',
              propsJson: {
                eyebrow: 'Contact',
                title: 'Plan your trip',
                subhead: 'We typically reply within one business day.',
              },
            },
            {
              type: 'trip_inquiry',
              propsJson: {
                eyebrow: 'Enquire',
                title: 'Tell us about your trip',
                body: '• Reply within one business day\n• No obligation quote\n• Tailored to your dates',
                formKey: 'travel_request',
                formTitle: 'Travel enquiry',
              },
            },
            {
              type: 'whatsapp_cta',
              propsJson: {
                title: 'Prefer WhatsApp?',
                body: 'Send a quick message — we usually reply within a few hours.',
                label: 'Chat on WhatsApp',
                href: '#',
              },
            },
            {
              type: 'rich_text',
              propsJson: {
                eyebrow: 'Visit',
                title: 'Find us',
                body: '12 Harbour Lane\nYour City, 00000\n\nPhone: +1 555 0100\nEmail: hello@example.com\nHours: Mon–Fri 9:00–18:00',
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: 'hotel_property',
    name: 'Hotel & resort website',
    category: 'hospitality',
    description:
      'Property site with immersive hero, hotel highlight, amenities, guest voices, and booking enquiry.',
    recommendedThemeKeysJson: ['atelier', 'horizon', 'localist'],
    structureJson: {
      navigation: [
        { label: 'Stay', path: '/' },
        { label: 'Rooms', path: '/rooms' },
        { label: 'Reserve', path: '/contact' },
      ],
      globalRegions: {
        header: { links: ['Stay', 'Rooms', 'Reserve'], ctaLabel: 'Reserve', ctaHref: '/contact' },
        footer: { note: 'A place to arrive · Powered by Wayrune' },
      },
      pages: [
        {
          path: '/',
          title: 'Stay',
          layoutKey: 'default',
          sections: [
            {
              type: 'hero',
              propsJson: {
                eyebrow: 'Hotel · Resort',
                headline: 'Arrive. Soften. Stay longer.',
                subhead: 'Quiet luxury, considered service, and spaces designed for unhurried mornings.',
                ctaLabel: 'Check availability',
                ctaHref: '/contact',
                secondaryCtaLabel: 'View rooms',
                secondaryCtaHref: '/rooms',
                variant: 'immersive',
                imageUrl: IMG.hotel,
              },
            },
            {
              type: 'stats',
              propsJson: {
                eyebrow: 'At a glance',
                items: [
                  { value: '42', label: 'Rooms & suites' },
                  { value: '4.9', label: 'Guest rating' },
                  { value: 'Spa', label: 'On property' },
                  { value: '24h', label: 'Concierge' },
                ],
              },
            },
            {
              type: 'feature_split',
              propsJson: {
                eyebrow: 'The property',
                title: 'Hospitality with presence',
                body: 'From the lobby light to turndown rituals, every detail is tuned for guests who want calm without losing character.',
                imageUrl: IMG.lobby,
                imageAlt: 'Hotel interior',
                ctaLabel: 'Explore rooms',
                ctaHref: '/rooms',
                imageSide: 'right',
              },
            },
            {
              type: 'hotel_highlight',
              propsJson: {
                name: 'Harbour House',
                stars: '5',
                imageUrl: IMG.hotel,
                body: 'A calm boutique stay a short walk from the waterfront.',
                amenities: 'Breakfast\nPool\nSpa\nWi‑Fi\nAirport transfer available',
                ctaLabel: 'Request this stay',
                ctaHref: '/contact',
              },
            },
            {
              type: 'testimonials',
              propsJson: {
                eyebrow: 'Guest book',
                title: 'Notes from recent stays',
                items: [
                  { quote: 'The room felt like a private residence — warm lighting, excellent linens, zero fuss.', author: 'Anika R.' },
                  { quote: 'Service was precise without being stiff. We extended our stay by two nights.', author: 'David & Leah' },
                ],
              },
            },
            {
              type: 'banner_slim',
              propsJson: {
                text: 'Midweek rates available this month — enquire for a soft arrival package.',
                ctaLabel: 'Reserve',
                ctaHref: '/contact',
              },
            },
          ],
        },
        {
          path: '/rooms',
          title: 'Rooms',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Rooms & suites',
                title: 'Spaces to linger',
                subhead: 'Natural light, considered materials, and quiet corners.',
              },
            },
            {
              type: 'image_text_list',
              propsJson: {
                title: 'Choose your room',
                items: [
                  {
                    image: IMG.room,
                    title: 'Garden room',
                    body: 'Soft light, courtyard views, and a writing desk for slow mornings.',
                  },
                  {
                    image: IMG.suite,
                    title: 'Harbour suite',
                    body: 'Separate living space, soaking tub, and waterfront outlook.',
                  },
                ],
              },
            },
            {
              type: 'gallery',
              propsJson: {
                eyebrow: 'Look inside',
                title: 'Gallery',
                images: [
                  { url: IMG.room, alt: 'Hotel bedroom' },
                  { url: IMG.suite, alt: 'Suite living area' },
                  { url: IMG.lobby, alt: 'Bathroom bathroom' },
                  { url: IMG.hotel, alt: 'Hotel lobby' },
                ],
              },
            },
            {
              type: 'accordion',
              propsJson: {
                eyebrow: 'Stay details',
                title: 'Before you arrive',
                items: [
                  {
                    label: 'What is check-in / check-out?',
                    body: 'Check-in from 2pm, check-out by 11am. Early or late options are subject to availability.',
                  },
                  {
                    label: 'Is breakfast included?',
                    body: 'Most rates include breakfast. Mention dietary needs when you enquire.',
                  },
                ],
              },
            },
          ],
        },
        {
          path: '/contact',
          title: 'Reserve',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Reservations',
                title: 'Request your dates',
                subhead: 'Tell us arrival, departure, and room preference.',
              },
            },
            {
              type: 'enquiry_split',
              propsJson: {
                eyebrow: 'Booking',
                title: 'Reserve your stay',
                body: '• Confirm within one business day\n• Flexible room options\n• Special requests welcome',
                formKey: 'room_booking',
                formTitle: 'Booking request',
              },
            },
            {
              type: 'map_block',
              propsJson: {
                title: 'On the map',
                body: 'Central, walkable, and close to the waterfront.',
                mapEmbedUrl: '',
                ctaLabel: 'Get directions',
                ctaHref: '/contact',
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: 'homestay_experience',
    name: 'Homestay website',
    category: 'hospitality',
    description: 'Warm, story-led site for homestays — host story, house photos, house rules, and booking.',
    recommendedThemeKeysJson: ['localist', 'horizon', 'altitude'],
    structureJson: {
      navigation: [
        { label: 'Home', path: '/' },
        { label: 'The house', path: '/house' },
        { label: 'Book', path: '/contact' },
      ],
      globalRegions: {
        header: { links: ['Home', 'The house', 'Book'], ctaLabel: 'Book a stay', ctaHref: '/contact' },
        footer: { note: 'A home away from home · Powered by Wayrune' },
      },
      pages: [
        {
          path: '/',
          title: 'Home',
          layoutKey: 'default',
          sections: [
            {
              type: 'hero',
              propsJson: {
                eyebrow: 'Homestay',
                headline: 'Come as a guest. Leave as family.',
                subhead:
                  'A lived-in home with garden mornings, home-cooked meals, and hosts who know the neighbourhood.',
                ctaLabel: 'Book a stay',
                ctaHref: '/contact',
                secondaryCtaLabel: 'See the house',
                secondaryCtaHref: '/house',
                variant: 'spotlight',
                imageUrl: IMG.garden,
              },
            },
            {
              type: 'feature_grid',
              propsJson: {
                eyebrow: 'What you get',
                title: 'Slow mornings, honest hospitality',
                body: 'Shared meals, local walks, and quiet corners to read.',
                columns: '3',
                items: [
                  { icon: '⌂', title: 'A real home', body: 'Lived-in rooms with character, not hotel sterility.' },
                  { icon: '◎', title: 'Local tips', body: 'Where the best chai is and which trail catches sunset.' },
                  { icon: '✦', title: 'Flexible stays', body: 'Two nights or two weeks — we adapt with you.' },
                ],
              },
            },
            {
              type: 'feature_split',
              propsJson: {
                eyebrow: 'Meet your hosts',
                title: 'We opened our doors for travellers',
                body: 'Experience daily life here — shared meals, neighbourhood shortcuts, and unhurried evenings.',
                imageUrl: IMG.living,
                imageAlt: 'Living room',
                ctaLabel: 'Book dates',
                ctaHref: '/contact',
                imageSide: 'left',
              },
            },
            {
              type: 'testimonials',
              propsJson: {
                eyebrow: 'Guest notes',
                title: 'What it felt like',
                items: [
                  {
                    quote: 'It never felt like a hotel — we cooked together once and learned three neighbourhood shortcuts.',
                    author: 'Priya & Arjun',
                  },
                  {
                    quote: 'Clean, calm, and full of character. Perfect base for exploring without the rush.',
                    author: 'Elena M.',
                  },
                ],
              },
            },
            {
              type: 'widget_cta',
              propsJson: {
                title: 'Have a quick question?',
                body: 'Ask about rooms, meals, or how to get here — chat anytime.',
                label: 'Open chat',
                href: '#',
              },
            },
          ],
        },
        {
          path: '/house',
          title: 'The house',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Inside & out',
                title: 'The house and garden',
                subhead: 'Rooms, kitchen, and outdoor corners.',
              },
            },
            {
              type: 'gallery',
              propsJson: {
                eyebrow: 'Look around',
                title: 'Spaces you will use',
                images: [
                  { url: IMG.living, alt: 'Living room' },
                  { url: IMG.room, alt: 'Bedroom' },
                  { url: IMG.garden, alt: 'Garden' },
                  { url: IMG.lobby, alt: 'Kitchen' },
                ],
              },
            },
            {
              type: 'accordion',
              propsJson: {
                eyebrow: 'House rules',
                title: 'Good to know',
                items: [
                  { label: 'Are meals included?', body: 'Breakfast is included. Home dinners can be arranged with notice.' },
                  { label: 'Is it suitable for children?', body: 'Yes — tell us ages when you book so we can prepare the right rooms.' },
                  { label: 'How do I reach you?', body: 'We share pickup tips and maps after you confirm dates.' },
                ],
              },
            },
          ],
        },
        {
          path: '/contact',
          title: 'Book',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Booking',
                title: 'Request your dates',
                subhead: 'Tell us who is coming and any meal preferences.',
              },
            },
            {
              type: 'form',
              propsJson: {
                eyebrow: 'Booking',
                title: 'Request your dates',
                body: 'Tell us who is coming, check-in / check-out, and any meal preferences.',
                formKey: 'room_booking',
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: 'personal_portfolio',
    name: 'Personal portfolio',
    category: 'portfolio',
    description: 'Clean personal site — intro, selected work, process, and contact.',
    recommendedThemeKeysJson: ['meridian', 'atelier', 'horizon'],
    structureJson: {
      navigation: [
        { label: 'Work', path: '/' },
        { label: 'About', path: '/about' },
        { label: 'Contact', path: '/contact' },
      ],
      globalRegions: {
        header: { links: ['Work', 'About', 'Contact'], ctaLabel: 'Hire me', ctaHref: '/contact' },
        footer: { note: 'Available for select projects' },
      },
      pages: [
        {
          path: '/',
          title: 'Work',
          layoutKey: 'default',
          sections: [
            {
              type: 'hero',
              propsJson: {
                eyebrow: 'Portfolio',
                headline: 'I design journeys, brands, and quiet digital experiences.',
                subhead:
                  'Independent work across travel, hospitality, and personal brand websites — clear, considered, and built to convert.',
                ctaLabel: 'Start a project',
                ctaHref: '/contact',
                secondaryCtaLabel: 'About me',
                secondaryCtaHref: '/about',
                variant: 'minimal',
              },
            },
            {
              type: 'feature_grid',
              propsJson: {
                eyebrow: 'Services',
                title: 'How I can help',
                body: 'Practical work — never noisy.',
                columns: '3',
                items: [
                  { icon: '1', title: 'Websites', body: 'Marketing sites that feel like the brand.' },
                  { icon: '2', title: 'Content systems', body: 'Structures that stay maintainable.' },
                  { icon: '3', title: 'Light product UI', body: 'Clear interfaces for real users.' },
                ],
              },
            },
            {
              type: 'cards_carousel',
              propsJson: {
                title: 'Selected work',
                items: [
                  {
                    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',
                    title: 'Travel brand site',
                    body: 'Destination-led marketing.',
                    href: '/about',
                  },
                  {
                    image: 'https://images.unsplash.com/photo-1498050108023-c41994a0d0cb?auto=format&fit=crop&w=900&q=80',
                    title: 'Product craft',
                    body: 'UI for ops tools.',
                    href: '/about',
                  },
                  {
                    image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=900&q=80',
                    title: 'Studio site',
                    body: 'Calm personal branding.',
                    href: '/about',
                  },
                ],
              },
            },
            {
              type: 'cta',
              propsJson: {
                eyebrow: 'Collaborate',
                title: 'Have a project in mind?',
                body: 'Share a short brief — timeline, goals, and links — and I will reply within a few days.',
                label: 'Say hello',
                href: '/contact',
                variant: 'card',
              },
            },
          ],
        },
        {
          path: '/about',
          title: 'About',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'About',
                title: 'Focused on clarity and craft',
                subhead: 'I help travel and hospitality brands show up online with the same care they give guests.',
              },
            },
            {
              type: 'timeline',
              propsJson: {
                eyebrow: 'Process',
                title: 'How projects usually go',
                items: [
                  { title: 'Listen', body: 'Goals, constraints, and the feeling the site should leave.' },
                  { title: 'Shape', body: 'Structure, copy direction, and a clear visual system.' },
                  { title: 'Ship', body: 'Build, refine, and hand over something maintainable.' },
                ],
              },
            },
            {
              type: 'rich_text',
              propsJson: {
                eyebrow: 'Background',
                title: 'Practical, never noisy',
                body: 'My work spans websites, content systems, and light product UI — always practical, never noisy.',
              },
            },
          ],
        },
        {
          path: '/contact',
          title: 'Contact',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Contact',
                title: 'Let’s talk',
                subhead: 'A short note is enough — what you are building and when you hope to start.',
              },
            },
            {
              type: 'form',
              propsJson: {
                eyebrow: 'Contact',
                title: 'Let’s talk',
                body: 'A short note is enough — what you are building and when you hope to start.',
                formKey: 'contact',
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: 'simple_landing',
    name: 'Marketing landing page',
    category: 'landing',
    description:
      'High-conversion single page: announcement, hero, features, social proof, pricing, and form.',
    recommendedThemeKeysJson: ['horizon', 'coastline', 'altitude', 'meridian'],
    structureJson: {
      navigation: [{ label: 'Home', path: '/' }],
      globalRegions: {
        header: { links: ['Home'], ctaLabel: 'Get started', ctaHref: '#form' },
        footer: { note: 'Built with Wayrune' },
      },
      pages: [
        {
          path: '/',
          title: 'Landing',
          layoutKey: 'landing',
          sections: [
            {
              type: 'logo_header_strip',
              propsJson: {
                text: 'Limited offer — reply this week for priority planning.',
                href: '#form',
                linkLabel: 'Enquire',
              },
            },
            {
              type: 'hero',
              propsJson: {
                eyebrow: 'Campaign',
                headline: 'Launch your next offer',
                subhead: 'Collect enquiries in one inbox with a focused landing page.',
                ctaLabel: 'Get started',
                ctaHref: '#form',
                variant: 'immersive',
                imageUrl: IMG.beach,
              },
            },
            {
              type: 'logo_cloud',
              propsJson: {
                eyebrow: 'As seen with',
                title: '',
                items: [
                  { url: '', alt: 'Brand one', href: '' },
                  { url: '', alt: 'Brand two', href: '' },
                  { url: '', alt: 'Brand three', href: '' },
                  { url: '', alt: 'Brand four', href: '' },
                ],
              },
            },
            {
              type: 'feature_grid',
              propsJson: {
                eyebrow: 'Benefits',
                title: 'Why this works',
                body: 'Clear promise, social proof, and one next step.',
                columns: '3',
                items: [
                  { icon: '✦', title: 'Fast to launch', body: 'Publish a polished page without a custom build.' },
                  { icon: '◈', title: 'Enquiries in inbox', body: 'Forms land where your team already works.' },
                  { icon: '◎', title: 'On-brand', body: 'Theme tokens keep colour and type consistent.' },
                ],
              },
            },
            {
              type: 'stats',
              propsJson: {
                eyebrow: 'Results',
                items: [
                  { value: '3×', label: 'More qualified leads' },
                  { value: '48h', label: 'Typical go-live' },
                  { value: '1', label: 'Inbox for all forms' },
                ],
              },
            },
            {
              type: 'pricing',
              propsJson: {
                eyebrow: 'Plans',
                title: 'Simple starting points',
                body: 'Choose a baseline — refine with us.',
                items: [
                  {
                    name: 'Essentials',
                    price: 'From $890',
                    features: 'Landing page\nEnquiry form\nTheme setup',
                    ctaLabel: 'Enquire',
                    ctaHref: '#form',
                    highlighted: false,
                  },
                  {
                    name: 'Signature',
                    price: 'From $1,490',
                    features: 'Multi-section page\nSocial proof\nPriority support',
                    ctaLabel: 'Enquire',
                    ctaHref: '#form',
                    highlighted: true,
                  },
                ],
              },
            },
            {
              type: 'testimonials',
              propsJson: {
                eyebrow: 'Proof',
                title: 'What teams say',
                items: [
                  { quote: 'We went live in two days and enquiries started the same week.', author: 'Ops lead' },
                ],
              },
            },
            {
              type: 'form',
              propsJson: {
                eyebrow: 'Enquire',
                title: 'Request a callback',
                body: 'Leave your details — we will reach out shortly.',
                formKey: 'contact',
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: 'tour_operator',
    name: 'Tour operator site',
    category: 'travel',
    description:
      'Conversion-focused tour site: seasonal promo, packages, itinerary, hotel highlight, and enquiry.',
    recommendedThemeKeysJson: ['coastline', 'horizon', 'altitude'],
    structureJson: {
      navigation: [
        { label: 'Home', path: '/' },
        { label: 'Tours', path: '/tours' },
        { label: 'Contact', path: '/contact' },
      ],
      globalRegions: {
        header: { links: ['Home', 'Tours', 'Contact'], ctaLabel: 'Enquire', ctaHref: '/contact' },
        footer: { note: 'Licensed tours · Powered by Wayrune' },
      },
      pages: [
        {
          path: '/',
          title: 'Home',
          layoutKey: 'default',
          sections: [
            {
              type: 'season_promo',
              propsJson: {
                eyebrow: 'This season',
                title: 'Coastal week — soft rates',
                body: 'Lush landscapes, quieter hotels, and softer prices.',
                imageUrl: IMG.coast,
                ctaLabel: 'View tours',
                ctaHref: '/tours',
              },
            },
            {
              type: 'trust_badges',
              propsJson: {
                title: 'Travel with confidence',
                items: [
                  { label: 'Licensed agency', body: 'Fully registered operators' },
                  { label: 'Secure payments', body: 'Card & bank transfer' },
                  { label: '24/7 line', body: 'On-trip support number' },
                ],
              },
            },
            {
              type: 'package_cards',
              propsJson: {
                eyebrow: 'Popular',
                title: 'Tours travellers book',
                items: [
                  {
                    image: IMG.coast,
                    name: 'Coastal week',
                    price: 'From $1,290',
                    nights: '7 nights',
                    highlights: 'Beach stay\nOne day tour\nAirport transfers',
                    ctaLabel: 'Enquire',
                    ctaHref: '/contact',
                  },
                  {
                    image: IMG.mountain,
                    name: 'Hill escape',
                    price: 'From $980',
                    nights: '5 nights',
                    highlights: 'Tea country lodge\nGuided walks\nTrain journey',
                    ctaLabel: 'Enquire',
                    ctaHref: '/contact',
                  },
                ],
              },
            },
            {
              type: 'destination_grid',
              propsJson: {
                eyebrow: 'Where we go',
                title: 'Destinations',
                items: [
                  { image: IMG.coast, name: 'Sri Lanka', tagline: 'Tea country to the south coast', href: '/tours' },
                  { image: IMG.temple, name: 'Vietnam', tagline: 'Cities, islands, countryside', href: '/tours' },
                ],
              },
            },
            {
              type: 'cta',
              propsJson: {
                title: 'Ready to travel?',
                body: 'Tell us your dates — we will send a clear outline.',
                label: 'Start enquiry',
                href: '/contact',
                variant: 'band',
              },
            },
          ],
        },
        {
          path: '/tours',
          title: 'Tours',
          layoutKey: 'default',
          sections: [
            {
              type: 'page_header',
              propsJson: {
                eyebrow: 'Tours',
                title: 'Sample itinerary',
                subhead: 'A coastal week you can tailor.',
              },
            },
            {
              type: 'itinerary',
              propsJson: {
                eyebrow: 'Day by day',
                title: 'Coastal week',
                items: [
                  { day: 'Day 1', title: 'Arrive & settle', body: 'Airport meet, check-in, gentle evening walk.' },
                  { day: 'Day 2', title: 'Coast road', body: 'Scenic drive with lunch by the water.' },
                  { day: 'Day 3', title: 'Free morning', body: 'Optional spa or market — your pace.' },
                  { day: 'Day 4', title: 'Village visit', body: 'Local lunch and craft stop.' },
                ],
              },
            },
            {
              type: 'hotel_highlight',
              propsJson: {
                name: 'Harbour House',
                stars: '4',
                imageUrl: IMG.hotel,
                body: 'A calm boutique stay a short walk from the waterfront.',
                amenities: 'Breakfast\nPool\nWi‑Fi\nAirport transfer available',
                ctaLabel: 'Request this stay',
                ctaHref: '/contact',
              },
            },
            {
              type: 'video_feature',
              propsJson: {
                eyebrow: 'Watch',
                title: 'A glimpse of the place',
                body: 'Sixty seconds that say more than a brochure.',
                videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
                ctaLabel: 'Plan this trip',
                ctaHref: '/contact',
              },
            },
          ],
        },
        {
          path: '/contact',
          title: 'Contact',
          layoutKey: 'default',
          sections: [
            {
              type: 'enquiry_split',
              propsJson: {
                eyebrow: 'Enquire',
                title: 'Book this tour',
                body: '• Reply within one business day\n• No obligation quote\n• Tailored to your dates',
                formKey: 'travel_request',
                formTitle: 'Tour enquiry',
              },
            },
          ],
        },
      ],
    },
  },
] as const;
