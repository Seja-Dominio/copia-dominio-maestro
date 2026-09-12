import { useState, useEffect } from "react";

export default function RechartsTest() {
  const [RC, setRC] = useState(null);
  useEffect(() => {
    import("recharts").then(setRC);
  }, []);

  if (!RC) return <p>Loading recharts...</p>;

  return (
    <RC.ResponsiveContainer width="100%" height={100}>
      <RC.BarChart data={[{v:1},{v:2}]}>
        <RC.Bar dataKey="v" fill="blue" />
      </RC.BarChart>
    </RC.ResponsiveContainer>
  );
}