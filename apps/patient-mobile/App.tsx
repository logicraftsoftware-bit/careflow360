import React, { createContext, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { patientApi } from "./src/api";

const C = {
  navy: "#06172D",
  teal: "#008F83",
  mint: "#E5F8F5",
  pale: "#F4FBFC",
  gray: "#71809A",
  line: "#DDE7EC",
  white: "#FFF",
  pink: "#FFE8ED",
  blue: "#E8F3FF",
};
const compact = Dimensions.get("window").width < 500;
type Screen = "home" | "doctors" | "doctor" | "labs" | "labBooking" | "reports";
const Portal = createContext<any>({
  data: null,
  clinic: null,
  openClinics: () => {},
});
const doctorPhotos = [
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=500",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=500",
  "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=500",
  "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=500",
];
const doctors = [
  [
    "Dr. Kavita Roy",
    "General Physician",
    "MBBS, MD",
    "8 years experience",
    "4.8 (320 reviews)",
    "₹500",
  ],
  [
    "Dr. Rohan Mehta",
    "Cardiologist",
    "MBBS, MD, DM",
    "10 years experience",
    "4.7 (280 reviews)",
    "₹700",
  ],
  [
    "Dr. Ananya Sen",
    "Dermatologist",
    "MBBS, MD (Skin & VD)",
    "6 years experience",
    "4.6 (210 reviews)",
    "₹600",
  ],
  [
    "Dr. S. Mukherjee",
    "Gynaecologist",
    "MBBS, MS (OBG)",
    "9 years experience",
    "4.8 (415 reviews)",
    "₹600",
  ],
  [
    "Dr. Arindam Saha",
    "Orthopedic",
    "MBBS, MS (Ortho)",
    "12 years experience",
    "4.5 (190 reviews)",
    "₹700",
  ],
];
const tests = [
  [
    "water",
    "Complete Blood Count (CBC)",
    "Helps detect a wide range of disorders like infection, anemia and more.",
    "₹499",
    "₹700",
    "29% OFF",
  ],
  [
    "water-outline",
    "HbA1c (Diabetes Test)",
    "Measures average blood sugar level for last 3 months.",
    "₹299",
    "₹450",
    "34% OFF",
  ],
  [
    "git-branch",
    "Thyroid Profile (T3, T4, TSH)",
    "Helps evaluate thyroid function and detect thyroid disorders.",
    "₹599",
    "₹900",
    "33% OFF",
  ],
  [
    "leaf",
    "Liver Function Test (LFT)",
    "Checks liver health and detects liver disorders.",
    "₹699",
    "₹1,000",
    "30% OFF",
  ],
  [
    "fitness",
    "Kidney Function Test (KFT)",
    "Assesses kidney health and its functioning.",
    "₹699",
    "₹1,000",
    "30% OFF",
  ],
  [
    "heart",
    "Lipid Profile",
    "Measures cholesterol and fat levels in your blood.",
    "₹499",
    "₹750",
    "33% OFF",
  ],
];

function Logo({ back, onBack }: { back?: boolean; onBack?: () => void }) {
  return (
    <View style={s.logoRow}>
      {back && <Round icon="arrow-back" onPress={onBack} />}
      <View style={s.logoMark}>
        <Ionicons name="medical" size={31} color="#fff" />
      </View>
      <View>
        <Text style={s.logoText}>
          CareFlow<Text style={{ color: C.teal }}>360</Text>
        </Text>
        <Text style={s.tag}>Your Health. Our Care.</Text>
      </View>
    </View>
  );
}
function Round({ icon, onPress }: { icon: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.round}>
      <Ionicons name={icon} size={25} color={C.navy} />
    </Pressable>
  );
}
function Button({
  children,
  onPress,
  small,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  small?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[s.button, small && s.buttonSmall]}>
      <Text style={s.buttonText}>{children}</Text>
      <Ionicons name="arrow-forward" size={20} color="#fff" />
    </Pressable>
  );
}
function Header({ back, onBack }: { back?: boolean; onBack?: () => void }) {
  const p = useContext(Portal);
  return (
    <View style={s.header}>
      <Logo back={back} onBack={onBack} />
      <View
        style={{
          flexDirection: "row",
          gap: compact ? 6 : 12,
          alignItems: "center",
        }}
      >
        <Round icon="search" />
        <Pressable onPress={p.openClinics} style={s.clinicButton}>
          <Ionicons name="location" size={18} color={C.teal} />
          <Text numberOfLines={1} style={s.clinicText}>
            {p.clinic?.name || "Choose clinic"}
          </Text>
          <Ionicons name="chevron-down" size={16} />
        </Pressable>
      </View>
    </View>
  );
}
function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: string;
}) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle}>{children}</Text>
      {action && <Text style={s.link}>{action} →</Text>}
    </View>
  );
}
function BottomNav({
  screen,
  setScreen,
}: {
  screen: Screen;
  setScreen: (x: Screen) => void;
}) {
  const data: [string, string, Screen][] = [
    ["home", "Home", "home"],
    ["people-outline", "Doctors", "doctors"],
    ["flask-outline", "Lab Tests", "labs"],
    ["document-text", "Reports", "reports"],
    ["person-outline", "Profile", "home"],
  ];
  return (
    <View style={s.bottom}>
      {data.map(([icon, label, target]) => (
        <Pressable
          key={label}
          onPress={() => setScreen(target)}
          style={s.navItem}
        >
          <View style={screen === target ? s.navActive : undefined}>
            <Ionicons
              name={icon}
              size={25}
              color={screen === target ? C.teal : C.gray}
            />
          </View>
          <Text
            style={[
              s.navText,
              screen === target && { color: C.teal, fontWeight: "800" },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Home({ go }: { go: (x: Screen) => void }) {
  const portal = useContext(Portal);
  return (
    <ScrollView contentContainerStyle={s.page}>
      <View style={s.header}>
        <Logo />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Round icon="notifications-outline" />
          <Pressable onPress={portal.openClinics} style={s.clinicButton}>
            <Ionicons name="business" size={18} color={C.teal} />
            <Text numberOfLines={1} style={s.clinicText}>
              {portal.clinic?.name}
            </Text>
            <Ionicons name="chevron-down" size={15} />
          </Pressable>
        </View>
      </View>
      <View style={s.hero}>
        <View style={{ width: compact ? "72%" : "58%", zIndex: 2 }}>
          <Text style={s.eyebrow}>HEALTHIER TOMORROW</Text>
          <Text style={s.heroTitle}>Care made{`\n`}simple for you</Text>
          <Text style={s.body}>
            Book doctors, lab tests and radiology tests — all in one place.
          </Text>
          <Button onPress={() => go("doctors")}>Book Appointment</Button>
        </View>
        <Image source={{ uri: doctorPhotos[1] }} style={s.heroDoctor} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.serviceRow}
      >
        {[
          [
            "medkit",
            "Book Doctor",
            "Consult with experienced doctors",
            "doctors",
          ],
          [
            "flask",
            "Book Lab Test",
            "Accurate reports from trusted labs",
            "labs",
          ],
          ["scan", "Book Radiology", "X-Ray, CT, MRI and more", "labs"],
        ].map((x, i) => (
          <Pressable
            key={x[1]}
            onPress={() => go(x[3] as Screen)}
            style={[
              s.service,
              {
                backgroundColor:
                  i === 1 ? "#FFF1F3" : i === 2 ? "#EDF6FF" : C.mint,
              },
            ]}
          >
            <View style={s.iconBox}>
              <Ionicons
                name={x[0]}
                size={compact ? 28 : 34}
                color={i === 1 ? "#F43F5E" : i === 2 ? "#258BEA" : C.teal}
              />
            </View>
            <Text style={s.cardTitle}>{x[1]}</Text>
            <Text style={s.bodySmall}>{x[2]}</Text>
            <Ionicons name="arrow-forward-circle" size={36} color={C.teal} />
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.quick}>
        {[
          ["calendar", "Appointments"],
          ["document-text", "Reports"],
          ["medkit", "Records"],
          ["medical", "Prescriptions"],
        ].map((x) => (
          <View key={x[1]} style={s.quickItem}>
            <Ionicons name={x[0]} size={compact ? 23 : 29} color={C.teal} />
            <Text style={s.quickText}>{x[1]}</Text>
          </View>
        ))}
      </View>
      <View style={s.banner}>
        <Ionicons name="heart-circle" size={compact ? 42 : 55} color={C.teal} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Take charge of your health</Text>
          <Text style={s.bodySmall}>
            Regular checkups for a healthier tomorrow.
          </Text>
        </View>
        {!compact && (
          <Button small onPress={() => go("labs")}>
            Explore Packages
          </Button>
        )}
      </View>
      <SectionTitle action="View All">Popular Health Packages</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[
          "Full Body Health Checkup",
          "Diabetes Screening",
          "Heart Health Checkup",
        ].map((x, i) => (
          <View key={x} style={s.package}>
            <Ionicons
              name={i === 2 ? "heart" : "calendar"}
              size={29}
              color={i === 2 ? "#F43F5E" : C.teal}
            />
            <Text style={s.cardTitle}>{x}</Text>
            <Text style={s.bodySmall}>
              {i === 0
                ? "Essential tests for a healthier you"
                : "Know your risk early"}
            </Text>
            <Text style={s.price}>{["₹1,499", "₹699", "₹999"][i]}</Text>
          </View>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

function Doctors({ go }: { go: (x: Screen) => void }) {
  const { data, openClinics } = useContext(Portal);
  const clinicDoctors = data?.doctors?.length
    ? data.doctors.map((doctor: any) => [
        doctor.name,
        doctor.specialization || doctor.department?.name || "Doctor",
        doctor.qualification || "",
        `${doctor.experience || 0} years experience`,
        "Available",
        `₹${Number(doctor.consultationFee || 0).toLocaleString("en-IN")}`,
      ])
    : doctors;
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header back onBack={() => go("home")} />
      <Text style={s.pageTitle}>Find Your Doctor</Text>
      <Text style={s.body}>Consult with experienced and trusted doctors</Text>
      <View style={s.search}>
        <Ionicons name="search" size={24} />
        <TextInput
          placeholder="Search doctor or specialty"
          placeholderTextColor={C.gray}
          style={s.input}
        />
        <Ionicons name="options" size={24} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 10 }}
      >
        {[
          "All",
          "General Physician",
          "Cardiologist",
          "Dermatologist",
          "Gynaecologist",
        ].map((x, i) => (
          <View key={x} style={[s.chip, i === 0 && s.chipActive]}>
            <Ionicons
              name={i === 0 ? "grid" : i === 2 ? "heart" : "medical"}
              size={19}
              color={i === 0 ? C.teal : C.gray}
            />
            <Text style={s.chipText}>{x}</Text>
          </View>
        ))}
      </ScrollView>
      <SectionTitle action={compact ? "Sort" : "Sort: Relevance"}>
        Available Doctors ({clinicDoctors.length})
      </SectionTitle>
      {clinicDoctors.map((d: any[], i: number) => (
        <Pressable key={d[0]} onPress={() => go("doctor")} style={s.doctorCard}>
          <Image source={{ uri: doctorPhotos[i % 4] }} style={s.doctorImage} />
          <View style={s.doctorInfo}>
            <View style={s.doctorTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.doctorName}>{d[0]}</Text>
                <Text style={s.cardTitleSmall}>{d[1]}</Text>
              </View>
              <Text style={s.price}>{d[5]}</Text>
            </View>
            <Text style={s.caption}>
              {d[2]} · {d[3]}
            </Text>
            <Text style={s.rating}>
              ★ <Text style={s.bodySmall}>{d[4]}</Text>
            </Text>
            <Text numberOfLines={1} style={s.bodySmall}>
              ● CareFlow Hospital, Jhargram
            </Text>
            <View style={s.tags}>
              {["Fever", "Diabetes", "Hypertension"].map((x) => (
                <Text key={x} style={s.tagChip}>
                  {x}
                </Text>
              ))}
            </View>
            <Button small onPress={() => go("doctor")}>
              Book Appointment
            </Button>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function DateSlots() {
  return (
    <>
      <Step n="1" title="Select Date" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[
          "Thu\n11\nSep",
          "Fri\n12\nSep",
          "Sat\n13\nSep",
          "Sun\n14\nSep",
          "Mon\n15\nSep",
          "Tue\n16\nSep",
          "Wed\n17\nSep",
        ].map((x, i) => (
          <View key={x} style={[s.date, i === 0 && s.selected]}>
            <Text style={[s.dateText, i === 0 && { color: "#fff" }]}>{x}</Text>
          </View>
        ))}
      </ScrollView>
      <Step n="2" title="Select Time Slot" />
      <View style={s.slots}>
        {[
          "9:00 AM",
          "9:30 AM",
          "10:00 AM",
          "10:30 AM",
          "11:00 AM",
          "11:30 AM",
          "3:00 PM",
          "3:30 PM",
          "4:00 PM",
          "4:30 PM",
          "5:00 PM",
          "5:30 PM",
        ].map((x, i) => (
          <View key={x} style={[s.slot, i === 0 && s.selected]}>
            <Text style={[s.slotText, i === 0 && { color: "#fff" }]}>{x}</Text>
          </View>
        ))}
      </View>
    </>
  );
}
function Step({ n, title }: { n: string; title: string }) {
  return (
    <View style={s.step}>
      <Text style={s.stepNo}>{n}</Text>
      <Text style={s.cardTitle}>{title}</Text>
    </View>
  );
}
function DoctorBooking({ go }: { go: (x: Screen) => void }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header back onBack={() => go("doctors")} />
      <View style={s.profileCard}>
        <Image source={{ uri: doctorPhotos[0] }} style={s.profileImage} />
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Dr. Kavita Roy</Text>
          <Text style={s.cardTitle}>General Physician</Text>
          <Text style={s.bodySmall}>MBBS, MD · 8 years experience</Text>
          <Text style={s.rating}>
            ★ 4.8 <Text style={s.bodySmall}>(320 reviews)</Text>
          </Text>
          <Text numberOfLines={2} style={s.bodySmall}>
            ● CareFlow Hospital, Jhargram
          </Text>
        </View>
      </View>
      <View style={s.formCard}>
        <DateSlots />
        <Step n="3" title="Visit Type" />
        <View style={s.choiceRow}>
          <Choice icon="business" title="In-clinic Visit" selected />
          <Choice icon="videocam" title="Video Consultation" />
        </View>
        <Step n="4" title="Add Notes (Optional)" />
        <TextInput
          multiline
          placeholder="Describe your symptoms or reason for visit..."
          style={s.notes}
        />
      </View>
      <View style={s.checkout}>
        <View>
          <Text style={s.bodySmall}>Consultation Fee</Text>
          <Text style={s.total}>₹500</Text>
        </View>
        <Button>Confirm Booking</Button>
      </View>
    </ScrollView>
  );
}

function Labs({ go }: { go: (x: Screen) => void }) {
  const [cart, setCart] = useState(0);
  const { data } = useContext(Portal);
  const clinicTests = data?.labTests?.length
    ? data.labTests.map((test: any) => [
        "flask",
        test.title,
        test.data?.description ||
          `${test.data?.sampleType || "Sample"} laboratory test`,
        `₹${Number(test.data?.price || 0).toLocaleString("en-IN")}`,
        "",
        test.data?.category || "Lab Test",
      ])
    : tests;
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: 100 }]}>
      <Header back onBack={() => go("home")} />
      <Text style={s.pageTitle}>Lab Tests</Text>
      <Text style={s.body}>
        Accurate reports from trusted and certified labs
      </Text>
      <View style={s.search}>
        <Ionicons name="search" size={24} />
        <TextInput placeholder="Search tests" style={s.input} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 10 }}
      >
        {[
          "All Tests",
          "Full Body",
          "Diabetes",
          "Thyroid",
          "Vitamin",
          "Liver",
          "Kidney",
          "Heart",
        ].map((x, i) => (
          <View key={x} style={[s.category, i === 0 && s.chipActive]}>
            <Ionicons
              name={i === 2 ? "water" : i === 7 ? "heart" : "grid"}
              size={25}
              color={i === 0 ? C.teal : "#F43F5E"}
            />
            <Text style={s.chipText}>{x}</Text>
          </View>
        ))}
      </ScrollView>
      <SectionTitle action="View All">Popular Tests</SectionTitle>
      {clinicTests.map((t: any[], i: number) => (
        <View key={t[1]} style={s.testCard}>
          <View
            style={[s.testIcon, { backgroundColor: i % 2 ? C.blue : C.pink }]}
          >
            <Ionicons
              name={t[0]}
              size={compact ? 28 : 34}
              color={i % 2 ? "#2999EA" : "#F43F5E"}
            />
          </View>
          <View style={s.testDetails}>
            <View style={s.doctorTop}>
              <Text style={[s.cardTitle, { flex: 1 }]}>{t[1]}</Text>
              <Text style={s.price}>{t[3]}</Text>
            </View>
            <Text style={s.bodySmall}>{t[2]}</Text>
            <View style={s.testBottom}>
              <Text style={s.caption}>⚗ {i + 1} Parameters · ◷ 6 hrs</Text>
              <Text style={s.discount}>{t[5]}</Text>
            </View>
            <Pressable onPress={() => setCart(cart + 1)} style={s.add}>
              <Text style={s.buttonText}>Add Test ＋</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <View style={s.cart}>
        <Ionicons name="cart" size={27} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{cart} items</Text>
          <Text style={s.caption}>Add tests to proceed</Text>
        </View>
        <Button onPress={() => cart && go("labBooking")}>View Cart</Button>
      </View>
    </ScrollView>
  );
}

function Choice({
  icon,
  title,
  selected,
}: {
  icon: string;
  title: string;
  selected?: boolean;
}) {
  return (
    <View style={[s.choice, selected && s.choiceSelected]}>
      <Ionicons name={icon} size={29} color={selected ? C.teal : "#2999EA"} />
      <View style={{ flex: 1 }}>
        <Text style={s.cardTitleSmall}>{title}</Text>
        <Text style={s.caption}>
          {selected
            ? "Get sample collected from your home"
            : "Visit nearest center"}
        </Text>
      </View>
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={26}
        color={selected ? C.teal : C.gray}
      />
    </View>
  );
}
function LabBooking({ go }: { go: (x: Screen) => void }) {
  return (
    <ScrollView contentContainerStyle={s.page}>
      <Header back onBack={() => go("labs")} />
      <View style={s.progress}>
        {[
          "1\nSelect Test",
          "2\nBooking Details",
          "3\nPayment",
          "4\nConfirmation",
        ].map((x, i) => (
          <Text key={x} style={[s.progressText, i === 1 && { color: C.teal }]}>
            {x}
          </Text>
        ))}
      </View>
      <View style={s.testCard}>
        <View style={s.testIcon}>
          <Ionicons name="water" size={40} color="#F43F5E" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Complete Blood Count (CBC)</Text>
          <Text style={s.body}>
            Helps detect a wide range of disorders like infection, anemia and
            more.
          </Text>
          <Text style={s.bodySmall}>⚗ 27 Parameters ◷ Reports in 6 hrs</Text>
        </View>
        <Text style={s.price}>₹499</Text>
      </View>
      <View style={s.formCard}>
        <Step n="1" title="Select Patient" />
        <View style={s.choiceRow}>
          <Choice icon="person" title="Dwaipayan Bhattacharya" selected />
          <Choice icon="person-add" title="Add New Patient" />
        </View>
        <Step n="2" title="Choose Sample Collection" />
        <View style={s.choiceRow}>
          <Choice icon="home" title="Home Collection" selected />
          <Choice icon="business" title="Visit Lab" />
        </View>
        <DateSlots />
        <Step n="5" title="Collection Address" />
        <View style={s.address}>
          <Ionicons name="location" size={25} color={C.gray} />
          <Text style={s.cardTitleSmall}>
            123, College Road, Jhargram{`\n`}Jhargram, West Bengal – 721507
          </Text>
          <Text style={s.link}>Change</Text>
        </View>
        <Step n="6" title="Additional Notes (Optional)" />
        <TextInput
          multiline
          placeholder="Any special instructions for the phlebotomist..."
          style={s.notes}
        />
      </View>
      <View style={s.checkout}>
        <View>
          <Text style={s.bodySmall}>Total Amount</Text>
          <Text style={s.total}>₹499</Text>
        </View>
        <Button>Proceed to Payment</Button>
      </View>
    </ScrollView>
  );
}

const reportRows = [
  [
    "flask",
    "Complete Blood Count (CBC)",
    "Lab Test",
    "CareFlow Diagnostic Lab",
    "10 Sep 2026",
    "Normal",
  ],
  [
    "git-branch",
    "Thyroid Profile (T3, T4, TSH)",
    "Lab Test",
    "CareFlow Diagnostic Lab",
    "28 Aug 2026",
    "Some values high",
  ],
  [
    "heart",
    "Chest X-Ray",
    "Radiology",
    "CareFlow Imaging Center",
    "12 Aug 2026",
    "Normal",
  ],
  [
    "flask",
    "Lipid Profile",
    "Lab Test",
    "CareFlow Diagnostic Lab",
    "20 Jul 2026",
    "Some values high",
  ],
  [
    "scan",
    "Ultrasound Abdomen (USG)",
    "Radiology",
    "CareFlow Imaging Center",
    "05 Jul 2026",
    "Normal",
  ],
  [
    "flask",
    "HbA1c (Diabetes Test)",
    "Lab Test",
    "CareFlow Diagnostic Lab",
    "18 Jun 2026",
    "Normal",
  ],
];
function Reports() {
  const { data, openClinics } = useContext(Portal);
  const [tab, setTab] = useState("All Reports");
  const clinicReports = data?.reports?.length
    ? data.reports.map((report: any) => {
        const details = report.data || {};
        const radiology =
          report.module === "radiology-reports" || details.type === "Radiology";
        return [
          radiology ? "scan" : "flask",
          report.title,
          radiology ? "Radiology" : "Lab Test",
          details.labName || details.centerName || data.clinic?.name,
          new Date(report.createdAt).toLocaleDateString("en-IN"),
          details.summaryStatus || details.interpretation || "Available",
          details.reportUrl || details.fileUrl,
        ];
      })
    : reportRows;
  const visible = clinicReports.filter(
    (r: any[]) =>
      tab === "All Reports" ||
      (tab === "Lab Reports" ? r[2] === "Lab Test" : r[2] === "Radiology")
  );
  return (
    <ScrollView contentContainerStyle={[s.page, { paddingBottom: 25 }]}>
      <View style={s.header}>
        <Logo />
        <Pressable onPress={openClinics} style={s.clinicButton}>
          <Ionicons name="business" size={18} color={C.teal} />
          <Text numberOfLines={1} style={s.clinicText}>
            {data?.clinic?.name}
          </Text>
          <Ionicons name="chevron-down" size={15} />
        </Pressable>
      </View>
      <Text style={s.pageTitle}>My Reports</Text>
      <Text style={s.body}>View and manage your lab and radiology reports</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.reportTabs}
      >
        {[
          ["All Reports", "8"],
          ["Lab Reports", "5"],
          ["Radiology Reports", "3"],
        ].map(([name, count]) => (
          <Pressable
            key={name}
            onPress={() => setTab(name)}
            style={[s.reportTab, tab === name && s.reportTabActive]}
          >
            <Ionicons
              name={
                name === "Lab Reports"
                  ? "flask-outline"
                  : name === "Radiology Reports"
                  ? "image-outline"
                  : "documents-outline"
              }
              size={21}
              color={tab === name ? "#fff" : C.navy}
            />
            <Text style={[s.reportTabText, tab === name && { color: "#fff" }]}>
              {name} ({count})
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.reportSearchRow}>
        <View style={[s.search, { flex: 1, marginTop: 0 }]}>
          <Ionicons name="search" size={23} color={C.navy} />
          <TextInput
            placeholder="Search reports (e.g. CBC, X-Ray, MRI)"
            placeholderTextColor={C.gray}
            style={s.input}
          />
        </View>
        <Pressable style={s.filter}>
          <Ionicons name="options" size={23} />
          <Text style={s.cardTitleSmall}>Filter</Text>
        </Pressable>
      </View>
      {visible.map((r: any[], i: number) => (
        <View key={r[1]} style={s.reportCard}>
          <View
            style={[
              s.reportIcon,
              {
                backgroundColor:
                  i % 3 === 1 ? C.blue : i % 3 === 2 ? C.pink : C.mint,
              },
            ]}
          >
            <Ionicons
              name={r[0]}
              size={compact ? 30 : 38}
              color={i % 3 === 1 ? "#398FE9" : i % 3 === 2 ? "#EF3F68" : C.teal}
            />
          </View>
          <View style={s.reportInfo}>
            <View style={s.doctorTop}>
              <Text style={[s.cardTitle, { flex: 1 }]}>{r[1]}</Text>
              <Text style={s.reportDate}>{r[4]}</Text>
            </View>
            <Text style={s.bodySmall}>
              {r[2]} • {r[3]}
            </Text>
            <View
              style={[s.reportStatus, r[5] !== "Normal" && s.reportStatusWarn]}
            >
              <Text
                style={[
                  s.reportStatusText,
                  r[5] !== "Normal" && { color: "#925900" },
                ]}
              >
                {r[5]}
              </Text>
            </View>
            <View style={s.reportActions}>
              <Pressable style={s.reportAction}>
                <Ionicons name="document-text-outline" size={21} />
                <Text style={s.reportActionText}>View Report</Text>
              </Pressable>
              <View style={s.actionDivider} />
              <Pressable style={s.reportAction}>
                <Ionicons name="download-outline" size={22} />
                <Text style={s.reportActionText}>Download</Text>
              </Pressable>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={C.navy} />
        </View>
      ))}
    </ScrollView>
  );
}

function PatientLogin({
  clinics,
  onLogin,
  initialClinic,
}: {
  clinics: any[];
  onLogin: (clinic: any) => void;
  initialClinic?: any;
}) {
  const [clinic, setClinic] = useState(initialClinic || clinics[0]);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const submit = async () => {
    if (!clinic)
      return Alert.alert("Choose clinic", "Select your clinic first.");
    try {
      setBusy(true);
      if (!sent) {
        const result = await patientApi.requestOtp(clinic.id, mobile);
        setSent(true);
        if (result.debugOtp) setOtp(result.debugOtp);
      } else {
        await patientApi.verifyOtp(clinic.id, mobile, otp);
        onLogin(clinic);
      }
    } catch (error: any) {
      Alert.alert("Unable to continue", error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={s.loginPage}>
      <Logo />
      <View style={s.loginHero}>
        <Ionicons name="shield-checkmark" size={55} color={C.teal} />
        <Text style={s.pageTitle}>Welcome to CareFlow360</Text>
        <Text style={[s.body, { textAlign: "center" }]}>
          Choose your clinic and securely access appointments, tests and
          reports.
        </Text>
      </View>
      <Pressable style={s.loginField} onPress={() => setPicker(true)}>
        <Ionicons name="business" size={23} color={C.teal} />
        <Text style={s.loginFieldText}>{clinic?.name || "Choose clinic"}</Text>
        <Ionicons name="chevron-down" size={20} />
      </Pressable>
      <View style={s.loginField}>
        <Ionicons name="call" size={23} color={C.teal} />
        <TextInput
          editable={!sent}
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
          placeholder="Registered mobile number"
          style={s.loginInput}
        />
      </View>
      {sent && (
        <View style={s.loginField}>
          <Ionicons name="keypad" size={23} color={C.teal} />
          <TextInput
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            placeholder="6-digit verification code"
            style={s.loginInput}
          />
        </View>
      )}
      <Pressable
        disabled={
          busy ||
          mobile.replace(/\D/g, "").length < 10 ||
          (sent && otp.length !== 6)
        }
        onPress={submit}
        style={[
          s.loginButton,
          (busy ||
            mobile.replace(/\D/g, "").length < 10 ||
            (sent && otp.length !== 6)) && { opacity: 0.45 },
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.buttonText}>
            {sent ? "Verify and continue" : "Send verification code"}
          </Text>
        )}
      </Pressable>
      {sent && (
        <Pressable
          onPress={() => {
            setSent(false);
            setOtp("");
          }}
        >
          <Text style={[s.link, { textAlign: "center", marginTop: 15 }]}>
            Change mobile number
          </Text>
        </Pressable>
      )}
      <ClinicModal
        visible={picker}
        clinics={clinics}
        close={() => setPicker(false)}
        choose={(c: any) => {
          setClinic(c);
          setPicker(false);
        }}
      />
    </SafeAreaView>
  );
}
function ClinicModal({
  visible,
  clinics,
  close,
  choose,
}: {
  visible: boolean;
  clinics: any[];
  close: () => void;
  choose: (c: any) => void;
}) {
  const [items, setItems] = useState(clinics);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [clinicError, setClinicError] = useState("");
  const refresh = async () => {
    try {
      setLoadingClinics(true);
      setClinicError("");
      setItems(await patientApi.clinics());
    } catch (error: any) {
      setClinicError(error.message || "Unable to load clinics");
    } finally {
      setLoadingClinics(false);
    }
  };
  useEffect(() => {
    setItems(clinics);
    if (visible && !clinics.length) refresh();
  }, [visible, clinics]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={s.modalRoot}>
        <Pressable style={s.modalShade} onPress={close} />
        <View style={s.clinicSheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetTitleRow}>
            <Text style={s.sectionTitle}>Choose your clinic</Text>
            <Pressable onPress={close} style={s.closeCircle}>
              <Ionicons name="close" size={24} />
            </Pressable>
          </View>
          <Text style={s.bodySmall}>
            Your doctors, tests and records will change with the selected
            clinic.
          </Text>
          {loadingClinics ? (
            <View style={s.clinicState}>
              <ActivityIndicator color={C.teal} />
              <Text style={s.bodySmall}>Loading clinics…</Text>
            </View>
          ) : clinicError ? (
            <View style={s.clinicState}>
              <Ionicons name="cloud-offline-outline" size={34} color={C.gray} />
              <Text style={[s.bodySmall, { textAlign: "center" }]}>
                {clinicError}
              </Text>
              <Pressable onPress={refresh} style={s.retryButton}>
                <Text style={s.buttonText}>Try again</Text>
              </Pressable>
            </View>
          ) : !items.length ? (
            <View style={s.clinicState}>
              <Text style={s.bodySmall}>No active clinics are available.</Text>
              <Pressable onPress={refresh} style={s.retryButton}>
                <Text style={s.buttonText}>Refresh</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => choose(c)}
                  style={s.clinicRow}
                >
                  <View style={s.logoMark}>
                    <Ionicons name="medical" size={25} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{c.name}</Text>
                    <Text style={s.bodySmall}>
                      {[c.address, c.city, c.state].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [clinics, setClinics] = useState<any[]>([]);
  const [clinic, setClinic] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const load = async (selected?: any) => {
    try {
      setLoading(true);
      const list = clinics.length ? clinics : await patientApi.clinics();
      setClinics(list);
      const session = await patientApi.session();
      const active =
        selected || list.find((c: any) => c.id === session.clinicId);
      setClinic(active || null);
      if (session.token && active) setData(await patientApi.bootstrap());
      else setData(null);
    } catch (error: any) {
      setData(null);
      Alert.alert("Unable to load", error.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  if (loading)
    return (
      <SafeAreaView style={s.loading}>
        <Logo />
        <ActivityIndicator size="large" color={C.teal} />
        <Text style={s.body}>Loading your healthcare workspace…</Text>
      </SafeAreaView>
    );
  if (!data)
    return (
      <PatientLogin
        clinics={clinics}
        initialClinic={clinic}
        onLogin={(selected) => load(selected)}
      />
    );
  const chooseClinic = async (selected: any) => {
    setPicker(false);
    if (selected.id === clinic?.id) return;
    await patientApi.logout();
    setClinic(selected);
    setData(null);
  };
  return (
    <Portal.Provider
      value={{
        data,
        clinic: data.clinic || clinic,
        openClinics: () => setPicker(true),
      }}
    >
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.pale} />
        <View style={{ flex: 1 }}>
          {screen === "home" ? (
            <Home go={setScreen} />
          ) : screen === "doctors" ? (
            <Doctors go={setScreen} />
          ) : screen === "doctor" ? (
            <DoctorBooking go={setScreen} />
          ) : screen === "labs" ? (
            <Labs go={setScreen} />
          ) : screen === "reports" ? (
            <Reports />
          ) : (
            <LabBooking go={setScreen} />
          )}
        </View>
        {(screen === "home" || screen === "reports") && (
          <BottomNav screen={screen} setScreen={setScreen} />
        )}
        <ClinicModal
          visible={picker}
          clinics={clinics}
          close={() => setPicker(false)}
          choose={chooseClinic}
        />
      </SafeAreaView>
    </Portal.Provider>
  );
}

const base = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.pale },
  page: { padding: 22, paddingBottom: 28, gap: 10 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontSize: 29, fontWeight: "900", color: C.navy },
  tag: { fontSize: 13, color: C.gray },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#CFF5EF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 21, fontWeight: "800", color: "#05675F" },
  eyebrow: { color: C.gray, fontWeight: "700", letterSpacing: 1.2 },
  hero: {
    height: 310,
    borderRadius: 28,
    backgroundColor: "#CFF8F2",
    padding: 28,
    overflow: "hidden",
  },
  heroTitle: {
    fontSize: 38,
    lineHeight: 43,
    fontWeight: "900",
    color: C.navy,
    marginVertical: 13,
  },
  heroDoctor: {
    position: "absolute",
    right: -12,
    bottom: 0,
    width: "48%",
    height: "100%",
    borderRadius: 25,
  },
  body: { fontSize: 18, lineHeight: 25, color: C.gray },
  bodySmall: { fontSize: 15, lineHeight: 21, color: C.gray },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 17,
    backgroundColor: C.teal,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    alignSelf: "flex-start",
    marginTop: 14,
  },
  buttonSmall: { minHeight: 42, paddingHorizontal: 15 },
  buttonText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  serviceRow: { flexDirection: "row", gap: 10 },
  service: {
    width: 250,
    minHeight: 260,
    borderRadius: 25,
    padding: 20,
    justifyContent: "space-between",
  },
  iconBox: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 20, fontWeight: "800", color: C.navy },
  cardTitleSmall: { fontSize: 16, fontWeight: "800", color: C.navy },
  quick: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 25,
    paddingVertical: 25,
    marginVertical: 8,
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    gap: 9,
    borderRightWidth: 1,
    borderColor: C.line,
  },
  quickText: { fontWeight: "700", color: C.navy, textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.mint,
    borderRadius: 24,
    padding: 20,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
  },
  sectionTitle: { fontSize: 24, fontWeight: "900", color: C.navy },
  link: { fontSize: 16, fontWeight: "700", color: C.teal },
  package: {
    width: 245,
    minHeight: 190,
    padding: 20,
    marginRight: 12,
    backgroundColor: "#fff",
    borderRadius: 24,
    justifyContent: "space-between",
  },
  price: { fontSize: 22, fontWeight: "900", color: C.navy },
  bottom: {
    height: 88,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  navItem: { alignItems: "center", gap: 5 },
  navText: { fontSize: 12, color: C.gray, fontWeight: "600" },
  pageTitle: { fontSize: 31, fontWeight: "900", color: C.navy },
  search: {
    height: 62,
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  input: { flex: 1, fontSize: 16, color: C.navy },
  chip: {
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: { borderColor: C.teal, backgroundColor: "#F0FCFA" },
  chipText: { fontWeight: "700", color: C.navy },
  doctorCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    flexDirection: "row",
    gap: 18,
    marginBottom: 8,
  },
  doctorImage: { width: 145, height: 150, borderRadius: 20 },
  doctorInfo: { flex: 1, minWidth: 0 },
  doctorTop: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  doctorName: { fontSize: 21, fontWeight: "900", color: C.navy },
  rating: {
    fontSize: 19,
    color: "#FFB800",
    fontWeight: "800",
    marginVertical: 6,
  },
  caption: { fontSize: 13, color: C.gray },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  tagChip: {
    backgroundColor: C.mint,
    color: "#05675F",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    fontSize: 12,
  },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    flexDirection: "row",
    gap: 22,
  },
  profileImage: { width: 195, height: 215, borderRadius: 22 },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 22,
    marginTop: 12,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 24,
    marginBottom: 14,
  },
  stepNo: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: C.teal,
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    textAlignVertical: "center",
  },
  date: {
    width: 82,
    height: 110,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    justifyContent: "center",
    marginRight: 10,
  },
  selected: { backgroundColor: C.teal, borderColor: C.teal },
  dateText: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 25,
    color: C.navy,
  },
  slots: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  slot: {
    width: "23%",
    height: 55,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 13,
    justifyContent: "center",
  },
  slotText: { textAlign: "center", fontSize: 15, color: C.navy },
  choiceRow: { flexDirection: "row", gap: 14 },
  choice: {
    flex: 1,
    minHeight: 95,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 17,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  choiceSelected: { borderColor: C.teal, backgroundColor: "#F2FCFA" },
  notes: {
    height: 135,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    padding: 15,
    textAlignVertical: "top",
    fontSize: 16,
  },
  checkout: {
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  total: { fontSize: 32, fontWeight: "900", color: C.navy },
  category: {
    width: 102,
    height: 105,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  testCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 17,
    flexDirection: "row",
    gap: 17,
    marginBottom: 2,
    alignItems: "flex-start",
  },
  testIcon: {
    width: 88,
    height: 88,
    borderRadius: 17,
    backgroundColor: C.pink,
    alignItems: "center",
    justifyContent: "center",
  },
  testDetails: { flex: 1, minWidth: 0 },
  testBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  oldPrice: { fontSize: 15, color: C.gray, textDecorationLine: "line-through" },
  discount: {
    backgroundColor: C.pink,
    color: "#F43F5E",
    padding: 7,
    borderRadius: 15,
    fontWeight: "800",
    marginVertical: 7,
  },
  add: {
    backgroundColor: C.teal,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 34,
    alignItems: "center",
  },
  cart: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 82,
    backgroundColor: "#fff",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingHorizontal: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  progress: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 15,
  },
  progressText: {
    textAlign: "center",
    color: C.gray,
    fontSize: 14,
    lineHeight: 25,
  },
  address: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
});
const mobile = StyleSheet.create({
  page: { padding: 14 },
  logoMark: { width: 40, height: 40 },
  logoText: { fontSize: 23 },
  tag: { fontSize: 11 },
  round: { width: 42, height: 42 },
  avatar: { width: 42, height: 42 },
  hero: { height: 270, padding: 18, borderRadius: 22 },
  heroTitle: { fontSize: 29, lineHeight: 33, marginVertical: 9 },
  heroDoctor: { right: -25, height: "72%", opacity: 0.7 },
  body: { fontSize: 15, lineHeight: 21 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  button: { minHeight: 43, paddingHorizontal: 14 },
  buttonText: { fontSize: 14 },
  service: { width: 148, minHeight: 205, padding: 14 },
  iconBox: { width: 48, height: 48 },
  cardTitle: { fontSize: 17 },
  cardTitleSmall: { fontSize: 14 },
  quick: { paddingVertical: 16 },
  quickText: { fontSize: 10 },
  banner: { padding: 15 },
  sectionTitle: { fontSize: 20 },
  package: { width: 205, minHeight: 165 },
  price: { fontSize: 18 },
  bottom: { height: 78 },
  navText: { fontSize: 10 },
  pageTitle: { fontSize: 26 },
  search: { height: 54 },
  input: { fontSize: 14 },
  chip: { height: 48, paddingHorizontal: 14 },
  chipText: { fontSize: 12 },
  doctorCard: { padding: 12, gap: 11 },
  doctorImage: { width: 92, height: 112 },
  doctorName: { fontSize: 17 },
  rating: { fontSize: 16, marginVertical: 4 },
  caption: { fontSize: 11 },
  tagChip: { fontSize: 10, paddingHorizontal: 8 },
  profileCard: { padding: 12, gap: 12 },
  profileImage: { width: 115, height: 145 },
  formCard: { padding: 14 },
  date: { width: 68, height: 92 },
  dateText: { fontSize: 14 },
  slots: { gap: 8 },
  slot: { width: "31%", height: 48 },
  slotText: { fontSize: 13 },
  choiceRow: { flexDirection: "column" },
  choice: { minHeight: 78, padding: 12 },
  notes: { height: 120 },
  checkout: { padding: 15, gap: 10 },
  total: { fontSize: 27 },
  category: { width: 82, height: 88 },
  testCard: { padding: 12, gap: 10 },
  testIcon: { width: 62, height: 62 },
  discount: { padding: 5, fontSize: 10 },
  add: { paddingVertical: 8, paddingHorizontal: 20 },
  cart: { height: 78, paddingHorizontal: 15 },
  progressText: { fontSize: 11 },
});
const reports = StyleSheet.create({
  navActive: {
    minWidth: 58,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: C.mint,
    alignItems: "center",
  },
  reportTabs: { flexDirection: "row", gap: 12, marginVertical: 16 },
  reportTab: {
    minHeight: 58,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reportTabActive: { backgroundColor: C.teal },
  reportTabText: { fontSize: 16, fontWeight: "700", color: C.navy },
  reportSearchRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  filter: {
    minWidth: 120,
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reportCard: {
    minHeight: 180,
    borderRadius: 23,
    backgroundColor: "#fff",
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginBottom: 6,
  },
  reportIcon: {
    width: 95,
    height: 95,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  reportInfo: { flex: 1, minWidth: 0, gap: 5 },
  reportDate: { fontSize: 15, color: C.gray },
  reportStatus: {
    alignSelf: "flex-start",
    backgroundColor: "#DFF8EC",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 4,
  },
  reportStatusWarn: { backgroundColor: "#FFF1D7" },
  reportStatusText: { fontSize: 14, fontWeight: "700", color: "#08795D" },
  reportActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginTop: 6,
  },
  reportAction: { flexDirection: "row", alignItems: "center", gap: 8 },
  reportActionText: { fontSize: 15, color: "#34445E" },
  actionDivider: { height: 24, width: 1, backgroundColor: C.line },
});
const mobileReports = StyleSheet.create({
  navActive: { minWidth: 44, paddingHorizontal: 11, paddingVertical: 5 },
  reportTabs: { gap: 8, marginVertical: 10 },
  reportTab: { minHeight: 48, paddingHorizontal: 14 },
  reportTabText: { fontSize: 13 },
  reportSearchRow: { gap: 8 },
  filter: { minWidth: 50, minHeight: 54 },
  reportCard: {
    minHeight: 145,
    padding: 12,
    gap: 10,
    alignItems: "flex-start",
  },
  reportIcon: { width: 62, height: 62 },
  reportDate: { fontSize: 11, maxWidth: 70, textAlign: "right" },
  reportStatus: { paddingHorizontal: 10, paddingVertical: 5 },
  reportStatusText: { fontSize: 11 },
  reportActions: { gap: 9, flexWrap: "wrap" },
  reportAction: { gap: 4 },
  reportActionText: { fontSize: 12 },
  actionDivider: { height: 20 },
});
const authStyles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  clinicButton: {
    maxWidth: 190,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: C.mint,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  clinicText: { maxWidth: 125, fontSize: 13, fontWeight: "700", color: C.navy },
  loading: {
    flex: 1,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
    gap: 25,
  },
  loginPage: {
    flex: 1,
    backgroundColor: C.pale,
    padding: 24,
    justifyContent: "center",
    gap: 14,
  },
  loginHero: { alignItems: "center", gap: 12, marginVertical: 24 },
  loginField: {
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loginFieldText: { flex: 1, fontSize: 16, fontWeight: "700", color: C.navy },
  loginInput: { flex: 1, fontSize: 16, color: C.navy },
  loginButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalShade: { flex: 1, backgroundColor: "rgba(4,20,35,.42)" },
  clinicSheet: {
    maxHeight: "65%",
    backgroundColor: C.pale,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    gap: 8,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  closeCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  clinicState: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  retryButton: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: C.teal,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 55,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#B8C3CC",
    alignSelf: "center",
    marginBottom: 10,
  },
  clinicRow: {
    minHeight: 82,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
const mobileAuth = StyleSheet.create({
  clinicButton: { maxWidth: 105, minHeight: 40, paddingHorizontal: 8 },
  clinicText: { maxWidth: 60, fontSize: 11 },
  loginPage: { padding: 18 },
  clinicSheet: { padding: 16 },
});
const allBase: any = { ...base, ...reports, ...authStyles };
const allMobile: any = { ...mobile, ...mobileReports, ...mobileAuth };
const s: any = compact
  ? Object.fromEntries(
      Object.keys(allBase).map((key) => [key, [allBase[key], allMobile[key]]])
    )
  : allBase;
