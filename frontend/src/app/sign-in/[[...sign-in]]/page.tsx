import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import Logo from "@/components/ui/Logo";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Link href="/" className="no-underline" aria-label="Athena home"><Logo /></Link>
      <SignIn />
    </div>
  );
}
