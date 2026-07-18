import { siteStructure } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Link } from './Link';
import { useNavigation } from './NavigationContext';

export function MobileNav() {
  const { path } = useNavigation();
  return (
    <nav
      className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 py-3 text-sm md:hidden"
      aria-label="Mobile"
    >
      {siteStructure.navigation.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            'whitespace-nowrap rounded-full px-3 py-1 no-underline',
            item.path === path
              ? 'bg-[var(--presence-primary)] text-white'
              : 'bg-white text-[var(--presence-muted)]',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
