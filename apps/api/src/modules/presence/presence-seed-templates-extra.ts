/** Extra page templates for Phases 1–3 module packs. */
export const EXTRA_SYSTEM_PAGE_TEMPLATES = [
  {
    key: 'home_marketing',
    name: 'Marketing homepage',
    category: 'page',
    layoutKey: 'default',
    description: 'Modern landing: announcement, hero, logos, features, stats, pricing, blog, newsletter, CTA. Pairs with Coastal Light, Midnight Harbor, or Alpine Mist.',
    structureJson: {
      sections: [
        {
          type: 'logo_header_strip',
          propsJson: {
            text: 'Early-bird rates for autumn departures — limited seats.',
            href: '/contact',
            linkLabel: 'Enquire now',
          },
        },
        {
          type: 'hero',
          propsJson: {
            eyebrow: 'Travel · Tailor-made',
            headline: 'Journeys shaped around you',
            subhead: 'Local expertise, calm planning, and trips that feel personal from day one.',
            ctaLabel: 'Plan my trip',
            ctaHref: '/contact',
            secondaryCtaLabel: 'See packages',
            secondaryCtaHref: '/about',
            variant: 'immersive',
            imageUrl:
              'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=1600&q=80',
          },
        },
        {
          type: 'logo_cloud',
          propsJson: {
            eyebrow: 'Trusted by',
            title: 'Partners & brands we work with',
            items: [
              { url: '', alt: 'Partner one', href: '' },
              { url: '', alt: 'Partner two', href: '' },
              { url: '', alt: 'Partner three', href: '' },
              { url: '', alt: 'Partner four', href: '' },
            ],
          },
        },
        {
          type: 'feature_grid',
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
          type: 'feature_split',
          propsJson: {
            eyebrow: 'Featured',
            title: 'A stay that feels like home',
            body: 'Thoughtful rooms, quiet corners, and mornings that start slowly.',
            imageUrl:
              'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
            imageAlt: 'Hotel interior',
            ctaLabel: 'Explore stays',
            ctaHref: '/about',
            imageSide: 'right',
          },
        },
        {
          type: 'stats',
          propsJson: {
            eyebrow: 'By the numbers',
            title: '',
            items: [
              { value: '12+', label: 'Years planning' },
              { value: '400+', label: 'Trips crafted' },
              { value: '98%', label: 'Would recommend' },
              { value: '24h', label: 'Typical reply' },
            ],
          },
        },
        {
          type: 'pricing',
          propsJson: {
            eyebrow: 'Plans',
            title: 'Simple starting points',
            body: 'Choose a baseline — we refine every trip with you.',
            items: [
              {
                name: 'Essentials',
                price: 'From $890',
                features: 'Airport transfer\n3 nights stay\nDaily breakfast',
                ctaLabel: 'Enquire',
                ctaHref: '/contact',
                highlighted: false,
              },
              {
                name: 'Signature',
                price: 'From $1,490',
                features: 'Everything in Essentials\nPrivate guide (1 day)\nWelcome dinner',
                ctaLabel: 'Enquire',
                ctaHref: '/contact',
                highlighted: true,
              },
              {
                name: 'Private',
                price: 'Custom',
                features: 'Fully bespoke itinerary\nDedicated planner\nPriority support',
                ctaLabel: 'Talk to us',
                ctaHref: '/contact',
                highlighted: false,
              },
            ],
          },
        },
        {
          type: 'testimonials',
          propsJson: {
            eyebrow: 'Proof',
            title: 'What travellers say',
            items: [
              { quote: 'Wonderful experience from enquiry to arrival.', author: 'Happy guest' },
              { quote: 'Felt personal, never rushed.', author: 'Family of four' },
            ],
          },
        },
        {
          type: 'blog_cards',
          propsJson: {
            eyebrow: 'Journal',
            title: 'Stories from the road',
            items: [
              {
                image:
                  'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=800&q=80',
                title: 'Three quiet beaches near town',
                excerpt: 'Where to go when you want the sea without the crowds.',
                href: '/about',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
                title: 'Packing light for monsoon',
                excerpt: 'A short list that still covers sudden weather.',
                href: '/about',
              },
            ],
          },
        },
        {
          type: 'newsletter',
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
            title: 'Ready to begin?',
            body: 'Send a short note and we will take it from there.',
            label: 'Get in touch',
            href: '/contact',
            variant: 'band',
          },
        },
      ],
    },
  },
  {
    key: 'about_page',
    name: 'About page',
    category: 'page',
    layoutKey: 'default',
    description: 'Page header, story, timeline, team, and CTA. Use on agency or portfolio sites.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'About',
            title: 'Who we are',
            subhead: 'A small team obsessed with thoughtful travel.',
          },
        },
        {
          type: 'rich_text',
          propsJson: {
            eyebrow: 'Our story',
            title: 'Designed around people',
            body: 'We started by planning trips for friends. Today we still work the same way — listen first, then shape options that fit real life.',
          },
        },
        {
          type: 'timeline',
          propsJson: {
            eyebrow: 'Process',
            title: 'How we work',
            items: [
              { title: 'Share your idea', body: 'Dates, budget, and the feeling you want from the trip.' },
              { title: 'We shape options', body: 'A shortlist with clear trade-offs — no fluff.' },
              { title: 'Travel with backup', body: 'We stay reachable while you are away.' },
            ],
          },
        },
        {
          type: 'team',
          propsJson: {
            eyebrow: 'People',
            title: 'Meet the team',
            body: 'The humans behind the journeys.',
            items: [
              {
                photo:
                  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
                name: 'Maya Chen',
                role: 'Founder',
                bio: 'Fifteen years crafting trips across Asia.',
              },
              {
                photo:
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
                name: 'Leo Park',
                role: 'Trip designer',
                bio: 'Obsessed with quiet trails and good food.',
              },
            ],
          },
        },
        {
          type: 'banner_slim',
          propsJson: {
            text: 'Want to talk through an idea? We are happy to help.',
            ctaLabel: 'Contact us',
            ctaHref: '/contact',
          },
        },
      ],
    },
  },
  {
    key: 'contact_full',
    name: 'Contact page (full)',
    category: 'page',
    layoutKey: 'default',
    description: 'Header, contact block, map, and enquiry form.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'Contact',
            title: 'Say hello',
            subhead: 'We typically reply within one business day.',
          },
        },
        {
          type: 'contact_block',
          propsJson: {
            eyebrow: 'Visit',
            title: 'Find us',
            address: '12 Harbour Lane\nYour City, 00000',
            phone: '+1 555 0100',
            email: 'hello@example.com',
            hours: 'Mon–Fri 9:00–18:00',
            mapEmbedUrl: '',
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
        {
          type: 'enquiry_split',
          propsJson: {
            eyebrow: 'Enquire',
            title: 'Tell us about your trip',
            body: '• Reply within one business day\n• No obligation quote\n• Tailored to your dates',
            formKey: 'contact',
            formTitle: 'Send a message',
          },
        },
      ],
    },
  },
  {
    key: 'pricing_page',
    name: 'Pricing page',
    category: 'page',
    layoutKey: 'default',
    description: 'Plans, comparison table, FAQ accordion, and CTA.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'Pricing',
            title: 'Clear starting points',
            subhead: 'Every trip is custom — these plans show typical ranges.',
          },
        },
        {
          type: 'pricing',
          propsJson: {
            eyebrow: 'Plans',
            title: 'Choose a starting point',
            body: 'We refine every itinerary with you.',
            items: [
              {
                name: 'Essentials',
                price: 'From $890',
                features: 'Airport transfer\n3 nights stay\nDaily breakfast',
                ctaLabel: 'Enquire',
                ctaHref: '/contact',
                highlighted: false,
              },
              {
                name: 'Signature',
                price: 'From $1,490',
                features: 'Everything in Essentials\nPrivate guide (1 day)\nWelcome dinner',
                ctaLabel: 'Enquire',
                ctaHref: '/contact',
                highlighted: true,
              },
              {
                name: 'Private',
                price: 'Custom',
                features: 'Fully bespoke itinerary\nDedicated planner\nPriority support',
                ctaLabel: 'Talk to us',
                ctaHref: '/contact',
                highlighted: false,
              },
            ],
          },
        },
        {
          type: 'comparison_table',
          propsJson: {
            title: 'Compare options',
            headers: 'Feature, Essentials, Signature, Private',
            rows: [
              { cells: 'Trip design, ✓, ✓, ✓' },
              { cells: 'Private guide, —, 1 day, Full' },
              { cells: 'Priority support, —, ✓, ✓' },
            ],
          },
        },
        {
          type: 'accordion',
          propsJson: {
            eyebrow: 'FAQ',
            title: 'Pricing questions',
            items: [
              { label: 'Are prices per person?', body: 'Most packages are priced per person sharing — we confirm for your group size.' },
              { label: 'What is included?', body: 'Each plan lists inclusions; flights and visas are usually separate unless noted.' },
            ],
          },
        },
        {
          type: 'cta',
          propsJson: {
            title: 'Need a custom quote?',
            body: 'Tell us your dates and we will shape an option.',
            label: 'Request a quote',
            href: '/contact',
            variant: 'band',
          },
        },
      ],
    },
  },
  {
    key: 'blog_index',
    name: 'Blog index',
    category: 'page',
    layoutKey: 'default',
    description: 'Header, article cards, and carousel.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'Journal',
            title: 'Stories & tips',
            subhead: 'Notes from the road and planning guides.',
          },
        },
        {
          type: 'blog_cards',
          propsJson: {
            eyebrow: 'Latest',
            title: 'From the journal',
            items: [
              {
                image:
                  'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=800&q=80',
                title: 'Three quiet beaches near town',
                excerpt: 'Where to go when you want the sea without the crowds.',
                href: '/about',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
                title: 'Packing light for monsoon',
                excerpt: 'A short list that still covers sudden weather.',
                href: '/about',
              },
            ],
          },
        },
        {
          type: 'cards_carousel',
          propsJson: {
            title: 'Browse themes',
            items: [
              {
                image:
                  'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=700&q=80',
                title: 'Islands',
                body: 'Slow ferries and clear water.',
                href: '/about',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=700&q=80',
                title: 'Mountains',
                body: 'Cool air and long views.',
                href: '/about',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=700&q=80',
                title: 'Cities',
                body: 'Markets, museums, late dinners.',
                href: '/about',
              },
            ],
          },
        },
      ],
    },
  },
  {
    key: 'privacy_legal',
    name: 'Privacy / legal',
    category: 'page',
    layoutKey: 'default',
    description: 'Legal text page for privacy and policies.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'Legal',
            title: 'Privacy policy',
            subhead: 'How we handle your information.',
          },
        },
        {
          type: 'legal_text',
          propsJson: {
            title: 'Privacy policy',
            updatedAt: 'Updated January 2026',
            body: 'We collect only what we need to respond to enquiries and deliver travel services.\n\nWe do not sell personal data. Contact us to request access or deletion.\n\nCookies may be used for essential site function and analytics. You can contact us with questions about this policy.',
          },
        },
      ],
    },
  },
  {
    key: 'tour_package',
    name: 'Tour package',
    category: 'page',
    layoutKey: 'default',
    description: 'Travel package page: hero promo, itinerary, hotel, packages, trust, enquiry. Pairs with Midnight Harbor or Coastal Light.',
    structureJson: {
      sections: [
        {
          type: 'season_promo',
          propsJson: {
            eyebrow: 'This season',
            title: 'Coastal week — soft rates',
            body: 'Lush landscapes, quieter hotels, and softer prices.',
            imageUrl:
              'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=1400&q=80',
            ctaLabel: 'Enquire',
            ctaHref: '/contact',
          },
        },
        {
          type: 'package_cards',
          propsJson: {
            eyebrow: 'Trips',
            title: 'Ready-to-tailor packages',
            items: [
              {
                image:
                  'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=800&q=80',
                name: 'Coastal week',
                price: 'From $1,290',
                nights: '7 nights',
                highlights: 'Beach stay\nOne day tour\nAirport transfers',
                ctaLabel: 'Enquire',
                ctaHref: '/contact',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
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
          type: 'itinerary',
          propsJson: {
            eyebrow: 'Sample plan',
            title: 'Day by day',
            items: [
              { day: 'Day 1', title: 'Arrive & settle', body: 'Airport meet, check-in, and a gentle evening walk.' },
              { day: 'Day 2', title: 'Coast road', body: 'Scenic drive with lunch by the water.' },
              { day: 'Day 3', title: 'Free morning', body: 'Optional spa or market — your pace.' },
            ],
          },
        },
        {
          type: 'hotel_highlight',
          propsJson: {
            name: 'Harbour House',
            stars: '4',
            imageUrl:
              'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
            body: 'A calm boutique stay a short walk from the waterfront.',
            amenities: 'Breakfast\nPool\nWi‑Fi\nAirport transfer available',
            ctaLabel: 'Request this stay',
            ctaHref: '/contact',
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
          type: 'trip_search_cta',
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
  },
  {
    key: 'destination_page',
    name: 'Destination page',
    category: 'page',
    layoutKey: 'default',
    description: 'Destination showcase: grid, masonry, route, video, enquiry. Add to agency or tour operator sites.',
    structureJson: {
      sections: [
        {
          type: 'page_header',
          propsJson: {
            eyebrow: 'Destinations',
            title: 'Places we love',
            subhead: 'Regions we know well — and plan with care.',
          },
        },
        {
          type: 'destination_grid',
          propsJson: {
            eyebrow: 'Go places',
            title: 'Featured destinations',
            items: [
              {
                image:
                  'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=800&q=80',
                name: 'Sri Lanka',
                tagline: 'Tea country to the south coast',
                href: '/about',
              },
              {
                image:
                  'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
                name: 'Vietnam',
                tagline: 'Cities, islands, and quiet countryside',
                href: '/about',
              },
            ],
          },
        },
        {
          type: 'gallery_masonry',
          propsJson: {
            eyebrow: 'Mood',
            title: 'Places & moments',
            images: [
              {
                url: 'https://images.unsplash.com/photo-1506929562365-f9e4a1d0c5b5?auto=format&fit=crop&w=900&q=80',
                alt: 'Coast',
              },
              {
                url: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=80',
                alt: 'Pool',
              },
              {
                url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80',
                alt: 'Lobby',
              },
              {
                url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=80',
                alt: 'Room',
              },
            ],
          },
        },
        {
          type: 'route_map',
          propsJson: {
            eyebrow: 'Route',
            title: 'A classic circuit',
            items: [
              { title: 'Arrive — Capital', body: 'Night 1–2' },
              { title: 'Hill country', body: 'Night 3–5' },
              { title: 'South coast', body: 'Night 6–8' },
            ],
            mapEmbedUrl: '',
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
        {
          type: 'enquiry_split',
          propsJson: {
            eyebrow: 'Enquire',
            title: 'Plan this destination',
            body: '• Reply within one business day\n• No obligation quote\n• Tailored to your dates',
            formKey: 'contact',
            formTitle: 'Send a message',
          },
        },
      ],
    },
  },
] as const;
