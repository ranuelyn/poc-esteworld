/content/poc-esteworld# %%bash
cd /content/poc-esteworld
# Qdrant'ta hangi tedavi türleri ve sıcaklıklar var? 
curl -s http://localhost:6333/collections/sales_dialogues/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 5, "with_payload": true, "with_vector": false}' | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data['result']['points']:
    pl = p['payload']
    print(f\"ID: {p['id'][:8]}... | Treatment: {pl['treatment']:20s} | Temp: {pl['lead_temperature']:4s} | Outcome: {pl['outcome']:10s} | Lang: {pl['language']}\")
    print(f\"   Preview: {pl['dialogue_text'][:120]}...\")
    print()
"
-bash: fg: %%bash: no such job
ID: 000e0a25... | Treatment: Plastic Surgery      | Temp: warm | Outcome: successful | Lang: en
   Preview: Representative: Of course I will call you tomorrow at 11am to answer all your questions and go through everything ??
Pat...

ID: 0016cf5a... | Treatment: Plastic Surgery      | Temp: warm | Outcome: successful | Lang: en
   Preview: Patient: Ok that makes choice between first two easy as tekes nor available
Patient: Is he fully booked
Representative: ...

ID: 002ccf66... | Treatment: Plastic Surgery      | Temp: hot  | Outcome: successful | Lang: en
   Preview: Patient: Thank you xx
Representative: You're welcome, dear Lily. I asked our doctor, and they recommended that when you ...

ID: 004a4a22... | Treatment: Plastic Surgery      | Temp: warm | Outcome: successful | Lang: tr
   Preview: Patient: Morning. 
Can you tell me if the restaurant in the hotel is reasonably priced please. And are there places walk...

ID: 0057a66d... | Treatment: Plastic Surgery      | Temp: hot  | Outcome: successful | Lang: en
   Preview: Patient: Amazing I’ll get some very good ones and take from now x
Representative: If you are taking iron tablets, you ca...

/content/poc-esteworld# %%bash
curl -s http://localhost:6333/collections/sales_dialogues/points/scroll \
  -H "Content-Type: application/json" \
  -d '{"limit": 2139, "with_payload": true, "with_vector": false}' | \
  python3 -c "
import sys, json
from collections import Counter
data = json.load(sys.stdin)
points = data['result']['points']

treatments = Counter(p['payload']['treatment'] for p in points)
outcomes = Counter(p['payload']['outcome'] for p in points)
temps = Counter(p['payload']['lead_temperature'] for p in points)
langs = Counter(p['payload']['language'] for p in points)

print('=== Tedavi Dağılımı ===')
for k, v in treatments.most_common(): print(f'  {k}: {v}')
print()
print('=== Outcome Dağılımı ===')
for k, v in outcomes.most_common(): print(f'  {k}: {v}')
print()
print('=== Sıcaklık Dağılımı ===')
for k, v in temps.most_common(): print(f'  {k}: {v}')
print()
print('=== Dil Dağılımı ===')
for k, v in langs.most_common(): print(f'  {k}: {v}'"points)*100:.1f}%')n: {outcomes[\"successful\"]/len
-bash: fg: %%bash: no such job
=== Tedavi Dağılımı ===
  Plastic Surgery: 1437
  Dental Treatment: 403
  Hair Transplant: 299

=== Outcome Dağılımı ===
  successful: 2080
  neutral: 59

=== Sıcaklık Dağılımı ===
  hot: 1036
  warm: 918
  cold: 185

=== Dil Dağılımı ===
  en: 1503
  tr: 636

Toplam: 2139 vektör
Başarılı oran: 97.2%
/content/poc-esteworld# 

Çıktılar bu şekilde. Test3'te de:
Hi, I am interested in rhinoplasty in June. Can you share hotel options and total schedule? I can send photos.	 mesjaından sonra sonuçlar:
Message Analysis

23 sec
Language
English (UK)
Intent
Price + Logistics + Photos
Treatment
Rhinoplasty
Lead Temp.
Hot · 90%
Rep Score
Waiting
Stage 3
Photo & Medical Form Request
Next milestone:
Patient has provided initial interest, requested logistics (hotel/schedule), and offered to send photos.
Next Best Action

AI
Personalised Treatment Plan & Pricing
The patient has shown high intent (hot temperature) and provided a photo, indicating they are moving into the decision-making phase. The next step is to immediately provide the requested schedule and pricing based on the photos and timeline, leveraging the established successful dialogue patterns.

Patient explicitly asked for hotel options and schedule, and offered to send photos, which aligns with the Photo & Medical Form Request stage.
Suggested Replies

Regenerate
1
Professional
Pick
Copy
Thank you for sharing the photo. Based on your interest in rhinoplasty in June and the details provided, I can prepare a personalised schedule and hotel options for you immediately. Please confirm the best dates you are considering so I can check the availability with the doctor.

Use this reply
2
Warm & Trust-building
Copy
I have received your photo and your interest in rhinoplasty in June. I will now put together the most suitable schedule and hotel options for you. Please let me know if you have any specific dates in mind.

Use this reply
3
Closing-focused
Copy
To ensure we secure the best package for you, could you confirm your preferred travel dates in June? I will prepare the full itinerary, including hotel options and the doctor's availability, right away.

Use this reply
Sales Boost

Ask for photos
Ask travel dates
Ask for deposit
If She Goes Silent

Day 1
Send personalised schedule and hotel options based on the provided photo and June timeline.
Day 3
Follow up if no response within 48 hours, focusing on addressing any immediate questions about the proposed schedule.
Day 7
Re-engage with a video consultation offer to address any remaining concerns about the treatment plan.
Day 14
Final check-in offering the package details and logistics support.

Böyle. Test3 ikinci mesajında ise (How much does hair transplant cost?):
Message Analysis

27 sec
Language
English (UK)
Intent
Price enquiry
Treatment
Rhinoplasty
Lead Temp.
Warm · 40%
Rep Score
Waiting
Stage 2
Treatment Interest
Next milestone:
Route patient to the correct specialist or gather more details about their specific Rhinoplasty goals.
Next Best Action

AI
Gather Specific Treatment Details
The patient asked a general cost question. The next step is to transition from general cost to understanding their specific needs for Rhinoplasty to build trust and move towards the Doctor Analysis stage.

Patient asked: 'How much does hair transplant cost?' (Note: The context is Rhinoplasty, but the patient asked about a related procedure cost, indicating price sensitivity is high. Need to pivot to the specific treatment interest.)
Suggested Replies

Regenerate
1
Professional
Copy
To help us understand your needs better, would you be comfortable sharing any photos or descriptions of the results you are aiming for?

Use this reply
2
Warm & Trust-building
Pick
Copy
Thank you for your interest in Rhinoplasty. To give you the most accurate information and a personalized overview, could you tell me a little more about what specific results you are hoping to achieve with your nose?

Use this reply
3
Closing-focused
Copy
I would be happy to connect you with one of our specialist doctors to discuss your specific Rhinoplasty goals and provide you with a tailored consultation plan.

Use this reply
Sales Boost

More trustworthy
Ask for photos
If She Goes Silent

Day 1
Gentle check-in asking about Rhinoplasty goals and offering a video consultation option, mentioning London office support.
Day 3
Offer a video consultation with a specialist to discuss personalized treatment plans for Rhinoplasty.
Day 7
Ask if the patient wants to keep their file open for future reference or close it.
Day 14
Final 20% discount offer for Rhinoplasty operations within 3 months if they are ready to proceed.

3. mesajda (I've paid the deposit and booked my flights for October 15th. What hotel will I stay at?) ise analiz:
Message Analysis

14 sec
Language
English (UK)
Intent
Logistics Confirmation
Treatment
Rhinoplasty
Lead Temp.
Hot · 100%
Rep Score
Waiting
Stage 7
Date Scheduling
Next milestone:
Confirm the exact operation date with the doctor.
Next Best Action

AI
Confirm Operation Date and Next Steps
The patient has completed the deposit and booked flights, indicating high intent. The next step is to confirm the specific treatment date with the doctor to move into the formal scheduling stage.

Patient explicitly stated they paid the deposit and booked flights for October 15th, which is a clear scheduling action.
Suggested Replies

Regenerate
1
Professional
Pick
Copy
Thank you for confirming the deposit and flight bookings. To finalize your schedule, I need to confirm the exact date you wish to proceed with your Rhinoplasty procedure with the doctor. Are you ready to discuss the final scheduling details?

Use this reply
2
Warm & Trust-building
Copy
That's wonderful news regarding your booking! To ensure everything is perfectly coordinated for your Rhinoplasty, let's confirm the exact date you are aiming for the procedure with the doctor. When would be a good time to discuss the schedule?

Use this reply
3
Closing-focused
Copy
Since you have secured your travel, let's lock in your preferred date with the doctor now so we can arrange all the necessary pre-op planning and logistics for your trip.

Use this reply
Sales Boost

Ask for photos
Ask travel dates
Confirm flights
If She Goes Silent

Day 1
Gentle check-in regarding doctor availability and pre-op requirements in English (UK)
Day 3
Offer a video consultation option with the surgeon to discuss the treatment plan in English (UK)
Day 7
Ask if the patient wants to keep the file open for future planning or close it.
Day 14
Final reminder about the VIP package and aftercare coordination.

Şeklinde. Türkçe olan 4. mesajımızda (Merhaba, diş tedavisi fiyatları hakkında bilgi almak istiyorum) analiz şöyle:
Message Analysis

17 sec
Language
Turkish
Intent
Price + Logistics
Treatment
Dental Treatment
Lead Temp.
Hot · 85%
Rep Score
Waiting
Stage 2
Treatment Interest
Next milestone:
Route to specialist and address specific pricing/logistics concerns.
Next Best Action

AI
Address pricing and logistics immediately
The patient is asking for price information. Leverage the successful dialogue history to move towards scheduling or providing a personalized plan, focusing on the value proposition (London office support, package deals).

Patient explicitly asked for pricing, and successful dialogues show high intent regarding price and logistics.
Suggested Replies

Regenerate
1
Professional
Copy
Tedavi planınızı daha net görebilmemiz ve size en doğru fiyatlandırmayı sunabilmemiz için, mevcut diş durumunuzla ilgili fotoğrafları paylaşabilir misiniz?

Use this reply
2
Warm & Trust-building
Pick
Copy
Merhaba Yusuf4, diş tedavisi fiyatları hakkında size özel bir plan hazırlayabilmemiz için öncelikle hangi tedavileri düşündüğünüzü ve mevcut durumunuz hakkında biraz daha bilgi alabilir miyim? Londra ofisimiz aracılığıyla size en uygun seçenekleri sunmaktan memnuniyet duyarız.

Use this reply
3
Closing-focused
Copy
Size özel fiyatlandırma ve tüm lojistik detayları (otel, transfer vb.) için bir doktor analizi yapmamız gerekiyor. Bu konuda size nasıl yardımcı olabilirim?

Use this reply
Sales Boost

Ask for photos
Ask travel dates
More trustworthy
If She Goes Silent

Day 1
Gentle check-in asking about medical photos/form status, mention London office support in Turkish
Day 3
Offer video consultation with surgeon, personalised treatment plan in Turkish
Day 7
Ask if patient wants file kept open or closed in Turkish
Day 14
Final 20% discount offer for operations within 3 months in Turkish

Sonuncu mesajda ise şöyle (I'm not sure anymore, your prices are too high compared to other clinics):
Message Analysis

14 sec
Language
English (UK)
Intent
Price + Scheduling/Logistics
Treatment
Rhinoplasty
Lead Temp.
Warm · 65%
Rep Score
Waiting
Stage 7
Date Scheduling
Next milestone:
Confirm operation date with doctor availability, addressing the patient's concern about timing.
Next Best Action

AI
Address Scheduling Conflict & Reiterate Support
The patient has expressed a clear scheduling conflict ('surgeon won’t have available dates now in April') and a desire to proceed before summer. The representative must now pivot to actively finding a solution or confirming the next available slot, leveraging the established trust.

Patient stated: 'I just aware that your surgeon won’t have available dates now in April :( and I wanted to sort this all before summer x'
Suggested Replies

Regenerate
1
Warm & Trust-building
Pick
Copy
I completely understand your concern about timing. We want to ensure you get the best possible plan. Let me check the current availability with the specialist immediately to see what dates are open for you before the summer.

Use this reply
2
Closing-focused
Copy
I will check the schedule right now. Based on the latest availability, we can discuss the best dates for your Rhinoplasty procedure. Would you prefer a quick call to review the options, or should I send you the available dates directly?

Use this reply
3
Closing-focused
Copy
Based on your details, the next best step is to confirm the review items and then I can help you secure the most suitable date.

Use this reply
Sales Boost

Ask travel dates
More persuasive
If She Goes Silent

Day 1
Follow up gently regarding the doctor's availability and offer to send a specific schedule.
Day 3
Provide a specific, curated list of available dates/slots based on the doctor's schedule.
Day 7
Re-engage by offering a brief video consultation with the surgeon to discuss the timeline and logistics.
Day 14
Offer a final, time-sensitive package review, focusing on the VIP package and aftercare coordination. 

Test5'i de terminalde yapıştırdım. Boş bi sonuç döndü şu şekilde:
/content/poc-esteworld# pm2 logs worker --lines 30 --nostream 2>&1 | grep -E "retrieved|score|RAG|embedding"
/content/poc-esteworld# 
