import { redirect } from "next/navigation";

// Keep the public product overview as the entry point for visitors and search engines.
export default function Home() {
  redirect("/discover.html");
}
