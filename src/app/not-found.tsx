import Link from "next/link";

export default function NotFound() {
  return <div className="shell content-page not-found"><span className="section-kicker">404</span><h1>That item is off the menu.</h1><p>It may have been discontinued or the link may be incorrect.</p><Link className="primary-button" href="/foods">Browse foods</Link></div>;
}
