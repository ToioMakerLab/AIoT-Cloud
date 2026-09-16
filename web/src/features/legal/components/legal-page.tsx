import { IconArrowLeft } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '@/components/language-switch';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export interface ILegalSection {
  heading: string;
  body?: string[];
  items?: string[];
}

interface Props {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: ILegalSection[];
}

export function LegalPage({ title, lastUpdated, intro, sections }: Props) {
  const { t } = useTranslation('legal');

  return (
    <div className="bg-background min-h-svh">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sign-in">
              <IconArrowLeft className="h-4 w-4" />
              {t('backToSignIn')}
            </Link>
          </Button>
          <div className="flex items-center gap-1">
            <ThemeSwitch />
            <LanguageSwitch />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{lastUpdated}</p>
        <p className="mt-6 leading-relaxed">{intro}</p>

        <Separator className="my-8" />

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              {section.body?.map((paragraph) => (
                <p key={paragraph} className="text-muted-foreground mt-3 leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="text-muted-foreground mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
