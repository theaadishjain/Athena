import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import Logo from "@/components/ui/Logo";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Link href="/" className="no-underline" aria-label="Athena home"><Logo /></Link>
      <SignUp />
    </div>
  );
}
