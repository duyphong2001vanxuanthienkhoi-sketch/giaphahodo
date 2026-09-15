export async function api(path,options={}) {
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,
    headers:{'Content-Type':'application/json','X-Coi-Request':'1',...options.headers},
    body:options.body===undefined?undefined:JSON.stringify(options.body),
  });
  let result;
  try{result=await response.json();}catch{throw new Error('Không kết nối được với Đỗ Gia. Vui lòng thử lại.');}
  if(!response.ok){const error=new Error(result.error||'Yêu cầu chưa thành công.');error.status=response.status;throw error;}
  return result;
}
