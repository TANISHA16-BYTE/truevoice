import { redirect } from "next/navigation";

// The dashboard sends people to /login if they are not signed in.
export default function Home() {
  redirect("/dashboard");
}