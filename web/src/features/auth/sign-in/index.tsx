import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import AuthLayout from '../auth-layout';
import { UserAuthForm } from './components/user-auth-form';

export default function SignIn() {
  const { t } = useTranslation('auth');
  return (
    <AuthLayout>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('signIn.title')}</CardTitle>
          <CardDescription>{t('signIn.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UserAuthForm />
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground px-8 text-center text-sm">
            {t('signIn.agreePrefix')}{' '}
            <Link to="/terms" className="hover:text-primary underline underline-offset-4">
              {t('signIn.termsOfService')}
            </Link>{' '}
            {t('signIn.and')}{' '}
            <Link to="/privacy" className="hover:text-primary underline underline-offset-4">
              {t('signIn.privacyPolicy')}
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
