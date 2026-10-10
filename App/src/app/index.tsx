import { Redirect } from 'expo-router';

export default function Index() {
  // Entry point: default to auth flow
  return <Redirect href="/(auth)/login" />;
}
