import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import AuthLayout from '../auth-layout';
import { SignUpForm } from './components/sign-up-form';

export default function SignUp() {
  const { t } = useTranslation('auth');
  return (
    <AuthLayout>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('signUp.title')}</CardTitle>
          <CardDescription>
            {t('signUp.line1')} <br />
            {t('signUp.alreadyHaveAccount')}{' '}
            <Link to="/sign-in" className="hover:text-primary underline underline-offset-4">
              {t('signUp.signIn')}
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground px-8 text-center text-sm">
            {t('signUp.agreePrefix')}{' '}
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
