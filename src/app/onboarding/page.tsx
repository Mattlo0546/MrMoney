import { redirect } from 'next/navigation';

/** The onboarding form is retired (D20): setup happens in the chat on /plan. */
export default function OnboardingPage() {
  redirect('/plan');
}
