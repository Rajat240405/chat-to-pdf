"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProcessingCard from "@/components/ProcessingCard";

export default function ProcessingPage() {
  const router = useRouter();

  useEffect(() => {

    

    
    // If the extraction already completed (homepage wrote the document to
    // sessionStorage), show the processing animation briefly then redirect.
    // Otherwise keep the full 10-second mock-processing delay.
    let delay = 10000;
    try {
      if (sessionStorage.getItem("promptpress_current_doc")) {
        delay = 1500;
      }
    } catch {
      // sessionStorage unavailable — use the default delay
    }


    

    const timer = setTimeout(() => {

      
      router.push("/preview");
    }, delay);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center bg-gray-50 px-4 py-12">
        <ProcessingCard />
      </main>
      <Footer />
    </div>
  );
}
