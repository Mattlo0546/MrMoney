import { redirect } from 'next/navigation';

/** Chat-first home: /plan shows the welcome chat when there is no plan, and the plan + chat when there is one. */
export default function Home() {
  redirect('/plan');
}
