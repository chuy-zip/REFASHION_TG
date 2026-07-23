import { redirect } from "next/navigation";
import { POST_LOGIN_PATH } from "@/lib/routes";

/** The app has a single entry point; "/" just forwards to it. */
export default function RootPage() {
  redirect(POST_LOGIN_PATH);
}
